package sniffer

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"encoding/json"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

// OutputChannel defines where the sniffed events go (Local Hub or Remote HTTP)
type OutputChannel interface {
	Send(event []byte)
}

// ServiceResolver resolves an IP address to a service/container name.
type ServiceResolver interface {
	GetServiceName(ip string) string
}

type Sniffer struct {
	device         string
	resolver       ServiceResolver
	output         OutputChannel
	mu             sync.Mutex
	activeRequests map[string]pendingRequest
	partials       map[string]*partialMessage
}

type TrafficEvent struct {
	EventType            string            `json:"eventType"`
	Source               string            `json:"source"`
	Destination          string            `json:"destination"`
	Metadata             map[string]string `json:"metadata"`
	RequestBody          string            `json:"requestBody,omitempty"`
	RequestHeaders       string            `json:"requestHeaders,omitempty"`
	ResponseStatus       string            `json:"status,omitempty"`
	ResponseHeaders      string            `json:"responseHeaders,omitempty"`
	ResponseBody         string            `json:"responseBody,omitempty"`
	DurationMilliseconds int64             `json:"durationMs,omitempty"`
	SrcIP                string            `json:"srcIP,omitempty"`
	SrcPort              string            `json:"srcPort,omitempty"`
	DstIP                string            `json:"dstIP,omitempty"`
	DstPort              string            `json:"dstPort,omitempty"`
}

type pendingRequest struct {
	method    string
	path      string
	startTime time.Time
}

// partialMessage is an HTTP message whose body spans more TCP segments than
// we've seen so far. It is emitted once complete, capped or stale.
type partialMessage struct {
	event     TrafficEvent
	raw       strings.Builder
	firstSeen time.Time
}

const (
	// maxBufferedLen caps how much of one message we reassemble.
	maxBufferedLen = 64 * 1024
	// partialTimeout is how long we wait for the rest of a body before emitting what we have.
	partialTimeout = 2 * time.Second
)

func NewSniffer(device string, resolver ServiceResolver, output OutputChannel) *Sniffer {
	return &Sniffer{
		device:         device,
		resolver:       resolver,
		output:         output,
		activeRequests: make(map[string]pendingRequest),
		partials:       make(map[string]*partialMessage),
	}
}

func (s *Sniffer) Start() error {
	handle, err := pcap.OpenLive(s.device, 65535, true, pcap.BlockForever)
	if err != nil {
		return fmt.Errorf("opening device %s: %w", s.device, err)
	}
	defer handle.Close()

	if err := handle.SetBPFFilter("tcp"); err != nil {
		return fmt.Errorf("setting BPF filter: %w", err)
	}

	log.Printf("Sniffer started on %s", s.device)

	go s.cleanupStaleRequests()
	go s.flushStalePartials()

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	for packet := range packetSource.Packets() {
		s.processPacket(packet)
	}
	return nil
}

func (s *Sniffer) cleanupStaleRequests() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for key, req := range s.activeRequests {
			if now.Sub(req.startTime) > 30*time.Second {
				delete(s.activeRequests, key)
			}
		}
		s.mu.Unlock()
	}
}

func (s *Sniffer) flushStalePartials() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		var stale []*partialMessage
		s.mu.Lock()
		for key, p := range s.partials {
			if now.Sub(p.firstSeen) > partialTimeout {
				stale = append(stale, p)
				delete(s.partials, key)
			}
		}
		s.mu.Unlock()
		for _, p := range stale {
			s.emitMessage(p.event, p.raw.String())
		}
	}
}

func (s *Sniffer) processPacket(packet gopacket.Packet) {
	ipLayer := packet.Layer(layers.LayerTypeIPv4)
	if ipLayer == nil {
		return
	}
	ip, _ := ipLayer.(*layers.IPv4)

	srcIP := ip.SrcIP.String()
	dstIP := ip.DstIP.String()

	srcService := s.resolver.GetServiceName(srcIP)
	dstService := s.resolver.GetServiceName(dstIP)

	log.Printf("Packet: %s (%s) -> %s (%s)", srcIP, srcService, dstIP, dstService)

	if srcService == srcIP && dstService == dstIP {
		log.Printf("Skipping packet %s -> %s (unresolved or internal)", srcIP, dstIP)
		return
	}

	metadata := make(map[string]string)
	metadata["timestamp"] = time.Now().Format(time.RFC3339)

	tcpLayer := packet.Layer(layers.LayerTypeTCP)
	if tcpLayer == nil {
		return
	}
	tcp, _ := tcpLayer.(*layers.TCP)
	payload := tcp.Payload
	if len(payload) == 0 {
		return
	}

	payloadStr := string(payload)
	lines := strings.Split(payloadStr, "\r\n")
	if len(lines) == 0 {
		return
	}

	parts := strings.Split(lines[0], " ")

	reqKey := srcIP + ":" + tcp.SrcPort.String() + "-" + dstIP + ":" + tcp.DstPort.String()
	respKey := dstIP + ":" + tcp.DstPort.String() + "-" + srcIP + ":" + tcp.SrcPort.String()

	isRequest := len(parts) >= 2 && isHTTPMethod(parts[0])
	isResponse := len(parts) >= 2 && strings.HasPrefix(parts[0], "HTTP/")

	// A segment that doesn't start a new message continues a buffered one.
	if !isRequest && !isResponse {
		s.appendToPartial(reqKey, payloadStr)
		return
	}
	// A new message on this direction means any buffered one is as complete as it'll get.
	s.flushPartial(reqKey)

	if isRequest {
		method := parts[0]
		path := parts[1]

		if strings.Contains(path, "health") || strings.Contains(path, "metrics") || strings.Contains(path, "ready") || strings.Contains(path, "live") {
			return
		}

		s.mu.Lock()
		s.activeRequests[reqKey] = pendingRequest{
			method:    method,
			path:      path,
			startTime: time.Now(),
		}
		s.mu.Unlock()

		metadata["method"] = method
		metadata["path"] = path

		event := TrafficEvent{
			EventType:      "request",
			Source:         srcService,
			Destination:    dstService,
			Metadata:       metadata,
			ResponseStatus: "Pending...",
			SrcIP:          srcIP,
			SrcPort:        tcp.SrcPort.String(),
			DstIP:          dstIP,
			DstPort:        tcp.DstPort.String(),
		}
		s.bufferOrEmit(reqKey, event, payloadStr)
		return
	}

	if isResponse {
		// The request must reach the correlator before its response does.
		s.flushPartial(respKey)

		s.mu.Lock()
		pending, exists := s.activeRequests[respKey]
		if exists {
			delete(s.activeRequests, respKey)
		}
		s.mu.Unlock()

		if exists {
			duration := time.Since(pending.startTime).Milliseconds()
			metadata["method"] = pending.method
			metadata["path"] = pending.path

			event := TrafficEvent{
				EventType:            "response",
				Source:               srcService,
				Destination:          dstService,
				Metadata:             metadata,
				ResponseStatus:       parts[1],
				DurationMilliseconds: duration,
				SrcIP:                srcIP,
				SrcPort:              tcp.SrcPort.String(),
				DstIP:                dstIP,
				DstPort:              tcp.DstPort.String(),
			}
			s.bufferOrEmit(reqKey, event, payloadStr)
		}
	}
}

// bufferOrEmit emits the message now if its body is complete, otherwise holds
// it under key until the remaining segments arrive.
func (s *Sniffer) bufferOrEmit(key string, event TrafficEvent, raw string) {
	if messageComplete(raw) {
		s.emitMessage(event, raw)
		return
	}
	p := &partialMessage{event: event, firstSeen: time.Now()}
	p.raw.WriteString(raw)
	s.mu.Lock()
	s.partials[key] = p
	s.mu.Unlock()
}

// appendToPartial adds a continuation segment to the message buffered under key.
func (s *Sniffer) appendToPartial(key, segment string) {
	s.mu.Lock()
	p, ok := s.partials[key]
	if !ok {
		s.mu.Unlock()
		return
	}
	p.raw.WriteString(segment)
	raw := p.raw.String()
	done := messageComplete(raw)
	if done {
		delete(s.partials, key)
	}
	s.mu.Unlock()

	if done {
		s.emitMessage(p.event, raw)
	}
}

// flushPartial emits whatever is buffered under key, if anything.
func (s *Sniffer) flushPartial(key string) {
	s.mu.Lock()
	p, ok := s.partials[key]
	if ok {
		delete(s.partials, key)
	}
	s.mu.Unlock()

	if ok {
		s.emitMessage(p.event, p.raw.String())
	}
}

// emitMessage fills in the headers and body from the raw message and emits the event.
func (s *Sniffer) emitMessage(event TrafficEvent, raw string) {
	headers, body := parseHTTPMessage(raw)
	if event.EventType == "response" {
		event.ResponseHeaders = headers
		event.ResponseBody = body
	} else {
		event.RequestHeaders = headers
		event.RequestBody = body
	}
	s.emit(event)
}

// messageComplete reports whether raw holds a full HTTP message (or as much as
// we're willing to buffer). Messages without Content-Length or chunked framing
// are treated as complete, since we can't tell where their body ends.
func messageComplete(raw string) bool {
	if len(raw) >= maxBufferedLen {
		return true
	}
	head, body, found := strings.Cut(raw, "\r\n\r\n")
	if !found {
		return false
	}
	_, headers, _ := strings.Cut(head, "\r\n")
	if strings.Contains(strings.ToLower(headerValue(headers, "Transfer-Encoding")), "chunked") {
		return strings.HasSuffix(body, "0\r\n\r\n")
	}
	if n, err := strconv.Atoi(headerValue(headers, "Content-Length")); err == nil {
		return len(body) >= n
	}
	return true
}

// maxBodyLen caps captured request/response bodies.
const maxBodyLen = 5000

// parseHTTPMessage splits a raw (possibly reassembled) HTTP message into
// its header block (start line excluded) and a display-ready body.
func parseHTTPMessage(payload string) (headers, body string) {
	head, rawBody, found := strings.Cut(payload, "\r\n\r\n")
	if !found {
		return "", ""
	}
	if _, rest, ok := strings.Cut(head, "\r\n"); ok {
		headers = rest
	}

	if strings.Contains(strings.ToLower(headerValue(headers, "Transfer-Encoding")), "chunked") {
		rawBody = decodeChunked(rawBody)
	}
	if enc := headerValue(headers, "Content-Encoding"); enc != "" && !strings.EqualFold(enc, "identity") {
		decoded, err := decompress(enc, rawBody)
		if err != nil {
			return headers, fmt.Sprintf("[%s-encoded body, %d bytes captured]", enc, len(rawBody))
		}
		rawBody = decoded
	}

	if len(rawBody) > maxBodyLen {
		rawBody = rawBody[:maxBodyLen] + "..."
	}
	return headers, rawBody
}

// decompress decodes a gzip or deflate body. Other encodings (e.g. br) are unsupported.
func decompress(encoding, body string) (string, error) {
	var r io.Reader
	switch strings.ToLower(encoding) {
	case "gzip":
		gz, err := gzip.NewReader(strings.NewReader(body))
		if err != nil {
			return "", err
		}
		r = gz
	case "deflate":
		// Usually zlib-wrapped per the spec, but some servers send raw deflate.
		if zr, err := zlib.NewReader(strings.NewReader(body)); err == nil {
			r = zr
		} else {
			r = flate.NewReader(strings.NewReader(body))
		}
	default:
		return "", fmt.Errorf("unsupported encoding %q", encoding)
	}
	var out bytes.Buffer
	if _, err := io.Copy(&out, io.LimitReader(r, maxBodyLen+1)); err != nil && out.Len() == 0 {
		return "", err
	}
	return out.String(), nil
}

// headerValue returns the value of the first header matching name (case-insensitive).
func headerValue(headers, name string) string {
	for _, line := range strings.Split(headers, "\r\n") {
		k, v, ok := strings.Cut(line, ":")
		if ok && strings.EqualFold(strings.TrimSpace(k), name) {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// decodeChunked best-effort decodes a chunked transfer-encoded body. Since we
// only see one TCP segment, a truncated final chunk is returned as-is.
func decodeChunked(body string) string {
	var out strings.Builder
	for {
		sizeLine, rest, ok := strings.Cut(body, "\r\n")
		if !ok {
			return out.String()
		}
		sizeStr, _, _ := strings.Cut(sizeLine, ";") // drop chunk extensions
		var size int
		if _, err := fmt.Sscanf(strings.TrimSpace(sizeStr), "%x", &size); err != nil {
			// Not chunk framing after all; return what we have plus the remainder.
			out.WriteString(body)
			return out.String()
		}
		if size == 0 {
			return out.String()
		}
		if size >= len(rest) {
			out.WriteString(rest)
			return out.String()
		}
		out.WriteString(rest[:size])
		body = strings.TrimPrefix(rest[size:], "\r\n")
	}
}

func (s *Sniffer) emit(event TrafficEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Sniffer: failed to marshal event: %v", err)
		return
	}
	s.output.Send(data)
}

var httpMethods = map[string]bool{
	"GET": true, "POST": true, "PUT": true, "DELETE": true,
	"PATCH": true, "HEAD": true, "OPTIONS": true,
}

func isHTTPMethod(s string) bool {
	return httpMethods[s]
}
