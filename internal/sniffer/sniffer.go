package sniffer

import (
	"fmt"
	"log"
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
}

type TrafficEvent struct {
	EventType            string            `json:"eventType"`
	Source               string            `json:"source"`
	Destination          string            `json:"destination"`
	Metadata             map[string]string `json:"metadata"`
	RequestBody          string            `json:"requestBody,omitempty"`
	RequestHeaders       string            `json:"requestHeaders,omitempty"`
	ResponseStatus       string            `json:"status,omitempty"`
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

func NewSniffer(device string, resolver ServiceResolver, output OutputChannel) *Sniffer {
	return &Sniffer{
		device:         device,
		resolver:       resolver,
		output:         output,
		activeRequests: make(map[string]pendingRequest),
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

	if len(parts) >= 2 && isHTTPMethod(parts[0]) {
		method := parts[0]
		path := parts[1]

		if strings.Contains(path, "health") || strings.Contains(path, "metrics") || strings.Contains(path, "ready") || strings.Contains(path, "live") {
			return
		}

		headers := ""
		body := ""
		if sections := strings.Split(payloadStr, "\r\n\r\n"); len(sections) > 1 {
			headerLines := strings.Split(sections[0], "\r\n")
			if len(headerLines) > 1 {
				headers = strings.Join(headerLines[1:], "\r\n")
			}
			body = sections[1]
			if len(body) > 5000 {
				body = body[:5000] + "..."
			}
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
			RequestBody:    body,
			RequestHeaders: headers,
			ResponseStatus: "Pending...",
			SrcIP:          srcIP,
			SrcPort:        tcp.SrcPort.String(),
			DstIP:          dstIP,
			DstPort:        tcp.DstPort.String(),
		}
		s.emit(event)
		return
	}

	if len(parts) >= 2 && strings.HasPrefix(parts[0], "HTTP/") {
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
			s.emit(event)
		}
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
