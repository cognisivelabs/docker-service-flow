package sniffer

import (
	"log"
	"strings"
	"time"

	"encoding/json"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/sachingupta/g-flow/backend/docker"
)

// OutputChannel defines where the sniffed events go (Local Hub or Remote HTTP)
type OutputChannel interface {
	Send(event []byte)
}

type Sniffer struct {
	device    string
	discovery *docker.DiscoveryService
	output    OutputChannel
}

type TrafficEvent struct {
	Source               string            `json:"source"`
	Destination          string            `json:"destination"`
	Metadata             map[string]string `json:"metadata"`
	RequestBody          string            `json:"requestBody,omitempty"`
	RequestHeaders       string            `json:"requestHeaders,omitempty"`
	ResponseStatus       string            `json:"status,omitempty"`
	DurationMilliseconds int64             `json:"durationMs,omitempty"`
}

type pendingRequest struct {
	method    string
	path      string
	startTime time.Time
}

var activeRequests = make(map[string]pendingRequest)

func NewSniffer(device string, discovery *docker.DiscoveryService, output OutputChannel) *Sniffer {
	return &Sniffer{
		device:    device,
		discovery: discovery,
		output:    output,
	}
}

func (s *Sniffer) Start() {
	handle, err := pcap.OpenLive(s.device, 65535, true, pcap.BlockForever)
	if err != nil {
		log.Fatalf("Error opening device %s: %v", s.device, err)
	}
	defer handle.Close()

	// Capture only TCP traffic
	if err := handle.SetBPFFilter("tcp"); err != nil {
		log.Fatalf("Error setting BPF filter: %v", err)
	}

	log.Printf("Sniffer started on %s", s.device)

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	for packet := range packetSource.Packets() {
		s.processPacket(packet)
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

	srcService := s.discovery.GetServiceName(srcIP)
	dstService := s.discovery.GetServiceName(dstIP)

	// Debug logs to trace resolution
	log.Printf("Packet: %s (%s) -> %s (%s)", srcIP, srcService, dstIP, dstService)

	// Skip if both are just IPs (not resolved to docker services) or same
	if srcService == srcIP && dstService == dstIP {
		// Log why we are skipping to help debug
		log.Printf("Skipping packet %s -> %s (unresolved or internal)", srcIP, dstIP)
		return
	}

	metadata := make(map[string]string)
	metadata["timestamp"] = time.Now().Format(time.RFC3339)

	// Try to parse HTTP
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

	// Correlation keys
	reqKey := srcIP + ":" + tcp.SrcPort.String() + "-" + dstIP + ":" + tcp.DstPort.String()
	respKey := dstIP + ":" + tcp.DstPort.String() + "-" + srcIP + ":" + tcp.SrcPort.String()

	// Check if Request
	if len(parts) >= 2 && (parts[0] == "GET" || parts[0] == "POST" || parts[0] == "PUT" || parts[0] == "DELETE") {
		method := parts[0]
		path := parts[1]

		// Filter noise
		if strings.Contains(path, "health") || strings.Contains(path, "metrics") || strings.Contains(path, "ready") || strings.Contains(path, "live") {
			return
		}

		// Extract Headers & Body
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

		// Store for correlation
		activeRequests[reqKey] = pendingRequest{
			method:    method,
			path:      path,
			startTime: time.Now(),
		}

		metadata["method"] = method
		metadata["path"] = path

		event := TrafficEvent{
			Source:         srcService,
			Destination:    dstService,
			Metadata:       metadata,
			RequestBody:    body,
			RequestHeaders: headers,
			ResponseStatus: "Pending...",
		}
		s.emit(event)
		return
	}

	// Check if Response (HTTP/1.1 200 OK)
	if len(parts) >= 2 && strings.HasPrefix(parts[0], "HTTP/") {
		if pending, exists := activeRequests[respKey]; exists {
			duration := time.Since(pending.startTime).Milliseconds()
			delete(activeRequests, respKey)

			metadata["method"] = pending.method
			metadata["path"] = pending.path

			event := TrafficEvent{
				Source:               dstService, // Original destination is now source of response
				Destination:          srcService, // Original source is now destination of response
				Metadata:             metadata,
				ResponseStatus:       parts[1],
				DurationMilliseconds: duration,
			}
			s.emit(event)
			return
		}
	}
}

func (s *Sniffer) emit(event TrafficEvent) {
	data, err := json.Marshal(event)
	if err == nil {
		s.output.Send(data)
	}
}
