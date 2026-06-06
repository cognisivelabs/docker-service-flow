package correlator

import (
	"encoding/json"
	"testing"
	"time"
)

type mockBroadcaster struct {
	messages [][]byte
}

func (m *mockBroadcaster) Send(data []byte) {
	m.messages = append(m.messages, data)
}

func (m *mockBroadcaster) lastMessage() *WSMessage {
	if len(m.messages) == 0 {
		return nil
	}
	var msg WSMessage
	json.Unmarshal(m.messages[len(m.messages)-1], &msg)
	return &msg
}

func (m *mockBroadcaster) reset() {
	m.messages = nil
}

func newTestEngine(b *mockBroadcaster) *Engine {
	return NewEngineWithConfig(b, 50*time.Millisecond, 100*time.Millisecond, 200*time.Millisecond)
}

func makeRequestEvent(src, dst, method, path, srcIP, srcPort, dstIP, dstPort string) []byte {
	event := RawEvent{
		EventType:   "request",
		Source:      src,
		Destination: dst,
		Metadata:    map[string]string{"method": method, "path": path},
		SrcIP:       srcIP,
		SrcPort:     srcPort,
		DstIP:       dstIP,
		DstPort:     dstPort,
	}
	data, _ := json.Marshal(event)
	return data
}

func makeResponseEvent(srcIP, srcPort, dstIP, dstPort, status string, durationMs int64) []byte {
	event := RawEvent{
		EventType:      "response",
		Source:         "svc",
		Destination:    "svc",
		Metadata:       map[string]string{},
		ResponseStatus: status,
		DurationMs:     durationMs,
		SrcIP:          srcIP,
		SrcPort:        srcPort,
		DstIP:          dstIP,
		DstPort:        dstPort,
	}
	data, _ := json.Marshal(event)
	return data
}

func TestRequestCreatesNewFlow(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/orders", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	flows := e.GetAllFlows()
	if len(flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(flows))
	}

	flow := flows[0]
	if flow.Status != "active" {
		t.Errorf("expected status 'active', got '%s'", flow.Status)
	}
	if len(flow.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(flow.Calls))
	}
	if flow.Calls[0].Method != "GET" {
		t.Errorf("expected method 'GET', got '%s'", flow.Calls[0].Method)
	}
	if flow.Calls[0].Status != "pending" {
		t.Errorf("expected call status 'pending', got '%s'", flow.Calls[0].Status)
	}

	if len(b.messages) != 1 {
		t.Errorf("expected 1 broadcast, got %d", len(b.messages))
	}
	msg := b.lastMessage()
	if msg.Type != "flow_update" {
		t.Errorf("expected message type 'flow_update', got '%s'", msg.Type)
	}
}

func TestResponseMatchesAndCompletesCall(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	// Send request: 10.0.0.1:50000 → 10.0.0.2:8080
	e.HandleEvent(makeRequestEvent("gateway", "orders", "POST", "/api/create", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	// Send response: 10.0.0.2:8080 → 10.0.0.1:50000 (reverse direction)
	e.HandleEvent(makeResponseEvent("10.0.0.2", "8080", "10.0.0.1", "50000", "201", 45))

	flows := e.GetAllFlows()
	if len(flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(flows))
	}

	call := flows[0].Calls[0]
	if call.Status != "201" {
		t.Errorf("expected status '201', got '%s'", call.Status)
	}
	if call.DurationMs != 45 {
		t.Errorf("expected durationMs 45, got %d", call.DurationMs)
	}
}

func TestCausalChainingSameFlow(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	// A → B (new flow)
	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/checkout", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	// B → C within causal window (should join same flow)
	e.HandleEvent(makeRequestEvent("orders", "inventory", "GET", "/api/check", "10.0.0.2", "50001", "10.0.0.3", "8080"))

	flows := e.GetAllFlows()
	if len(flows) != 1 {
		t.Fatalf("expected 1 flow (causal chain), got %d", len(flows))
	}

	flow := flows[0]
	if len(flow.Calls) != 2 {
		t.Fatalf("expected 2 calls in flow, got %d", len(flow.Calls))
	}
	if flow.Calls[0].Source != "gateway" || flow.Calls[1].Source != "orders" {
		t.Errorf("unexpected call sources: %s, %s", flow.Calls[0].Source, flow.Calls[1].Source)
	}
	if len(flow.Services) != 3 {
		t.Errorf("expected 3 services, got %d: %v", len(flow.Services), flow.Services)
	}
}

func TestNoCausalChainAfterWindow(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	// A → B
	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/checkout", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	// Wait past causal window (50ms in test config)
	time.Sleep(80 * time.Millisecond)

	// B → C (should be a separate flow since causal window expired)
	e.HandleEvent(makeRequestEvent("orders", "inventory", "GET", "/api/check", "10.0.0.2", "50001", "10.0.0.3", "8080"))

	flows := e.GetAllFlows()
	if len(flows) != 2 {
		t.Fatalf("expected 2 separate flows after window expiry, got %d", len(flows))
	}
}

func TestFlowSettling(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/test", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	flows := e.GetAllFlows()
	if flows[0].Status != "active" {
		t.Fatalf("expected active flow initially")
	}

	// Wait past settling window (100ms in test config) + maintenance tick (500ms)
	time.Sleep(700 * time.Millisecond)

	flows = e.GetAllFlows()
	if len(flows) != 1 {
		t.Fatalf("expected 1 flow, got %d", len(flows))
	}
	if flows[0].Status != "complete" {
		t.Errorf("expected flow status 'complete' after settling, got '%s'", flows[0].Status)
	}

	// Check that a flow_complete message was broadcast
	foundComplete := false
	for _, msg := range b.messages {
		var wsMsg WSMessage
		json.Unmarshal(msg, &wsMsg)
		if wsMsg.Type == "flow_complete" {
			foundComplete = true
			break
		}
	}
	if !foundComplete {
		t.Error("expected a flow_complete broadcast")
	}
}

func TestRingBufferEviction(t *testing.T) {
	rb := newRingBuffer(3)

	for i := 0; i < 5; i++ {
		rb.Push(&Flow{FlowID: string(rune('A' + i))})
	}

	if rb.Len() != 3 {
		t.Fatalf("expected ring buffer len 3, got %d", rb.Len())
	}

	all := rb.All()
	if all[0].FlowID != "C" || all[1].FlowID != "D" || all[2].FlowID != "E" {
		t.Errorf("expected [C, D, E], got [%s, %s, %s]", all[0].FlowID, all[1].FlowID, all[2].FlowID)
	}
}

func TestStaleRequestTTLCleanup(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b) // requestTTL = 200ms

	// Send request with no matching response
	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/slow", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	e.mu.Lock()
	pendingCount := len(e.pendingCalls)
	e.mu.Unlock()
	if pendingCount != 1 {
		t.Fatalf("expected 1 pending call, got %d", pendingCount)
	}

	// Wait past TTL (200ms) + maintenance tick (500ms)
	time.Sleep(800 * time.Millisecond)

	e.mu.Lock()
	pendingCount = len(e.pendingCalls)
	e.mu.Unlock()
	if pendingCount != 0 {
		t.Errorf("expected 0 pending calls after TTL cleanup, got %d", pendingCount)
	}
}
