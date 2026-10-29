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
	streams        map[string]streamState
	natIndex       map[string]string // server ip:port|client port → request key
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
	clientIP  string
	natKey    string
}

// streamState tracks how far into one direction of a TCP connection we've seen,
// so retransmitted segments aren't processed twice.
type streamState struct {
	next     uint32 // sequence number just past the last byte seen
	lastSeen time.Time
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
		streams:        make(map[string]streamState),
		natIndex:       make(map[string]string),
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
	go reportDrops(handle)

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	for packet := range packetSource.Packets() {
		s.processPacket(packet)
	}
	return nil
}

// reportDrops logs whenever the capture reports newly dropped packets, which
// mean missed requests or responses.
func reportDrops(handle *pcap.Handle) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	var lastDropped, lastIfDropped int
	for range ticker.C {
		stats, err := handle.Stats()
		if err != nil {
			return
		}
		if stats.PacketsDropped > lastDropped || stats.PacketsIfDropped > lastIfDropped {
			log.Printf("Sniffer: capture dropped packets (received %d, dropped %d, interface dropped %d)",
				stats.PacketsReceived, stats.PacketsDropped, stats.PacketsIfDropped)
			lastDropped, lastIfDropped = stats.PacketsDropped, stats.PacketsIfDropped
		}
	}
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
				delete(s.natIndex, req.natKey)
			}
		}
		for key, st := range s.streams {
			if now.Sub(st.lastSeen) > 30*time.Second {
				delete(s.streams, key)
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
	reqKey := srcIP + ":" + tcp.SrcPort.String() + "-" + dstIP + ":" + tcp.DstPort.String()
	respKey := dstIP + ":" + tcp.DstPort.String() + "-" + srcIP + ":" + tcp.SrcPort.String()

	// A new or closing connection invalidates sequence tracking for these ports,
	// which may be reused by a later connection with a different sequence space.
	if tcp.SYN || tcp.FIN || tcp.RST {
		s.resetStream(reqKey)
	}
	// Once a side closes, no more of its data is coming: emit whatever it had
	// buffered (after this segment's own payload) instead of waiting for the
	// timeout. A reset aborts both directions, e.g. a client hanging up mid-response.
	if tcp.FIN || tcp.RST {
		defer s.flushPartial(reqKey)
	}
	if tcp.RST {
		defer s.flushPartial(respKey)
	}

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

	if s.isRetransmission(reqKey, tcp.Seq, len(payload)) {
		return
	}

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

		natKey := natLookupKey(dstIP, tcp.DstPort.String(), tcp.SrcPort.String())
		s.mu.Lock()
		s.activeRequests[reqKey] = pendingRequest{
			method:    method,
			path:      path,
			startTime: time.Now(),
			clientIP:  srcIP,
			natKey:    natKey,
		}
		s.natIndex[natKey] = reqKey
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

		pending, exists := s.takePending(respKey, natLookupKey(srcIP, tcp.SrcPort.String(), tcp.DstPort.String()))
		if exists && pending.clientIP != dstIP {
			// NAT showed the client under a different address on the way back
			// (e.g. localhost via a published port); report the request's.
			dstIP = pending.clientIP
			dstService = s.resolver.GetServiceName(dstIP)
		}

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

// natLookupKey identifies a connection by its server address and client port,
// which survive NAT even when the client address appears differently per direction.
func natLookupKey(serverIP, serverPort, clientPort string) string {
	return serverIP + ":" + serverPort + "|" + clientPort
}

// takePending removes and returns the request a response answers: by exact
// connection key, or failing that by server address and client port.
func (s *Sniffer) takePending(respKey, natKey string) (pendingRequest, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := respKey
	pending, ok := s.activeRequests[key]
	if !ok {
		if key, ok = s.natIndex[natKey]; ok {
			pending, ok = s.activeRequests[key]
		}
	}
	if !ok {
		return pendingRequest{}, false
	}
	delete(s.activeRequests, key)
	delete(s.natIndex, pending.natKey)
	return pending, true
}

// isRetransmission reports whether every byte of this segment was already seen on
// this direction of the connection (a TCP retransmission), and records it otherwise.
// Segments arriving out of order behind a later one are also treated as seen, which
// is an acceptable loss on a local bridge where reordering is rare.
func (s *Sniffer) isRetransmission(key string, seq uint32, length int) bool {
	end := seq + uint32(length)
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.streams[key]
	if ok && seqAtOrBefore(end, st.next) {
		return true
	}
	if !ok || seqAtOrBefore(st.next, end) {
		st.next = end
	}
	st.lastSeen = time.Now()
	s.streams[key] = st
	return false
}

// resetStream forgets sequence tracking for one direction of a connection.
func (s *Sniffer) resetStream(key string) {
	s.mu.Lock()
	delete(s.streams, key)
	s.mu.Unlock()
}

// seqAtOrBefore compares TCP sequence numbers, allowing for wraparound.
func seqAtOrBefore(a, b uint32) bool {
	return int32(a-b) <= 0
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
