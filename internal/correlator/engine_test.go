package correlator

import (
	"encoding/json"
	"fmt"
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

	// A → B, answered
	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/checkout", "10.0.0.1", "50000", "10.0.0.2", "8080"))
	e.HandleEvent(makeResponseEvent("10.0.0.2", "8080", "10.0.0.1", "50000", "200", 5))

	// Wait past causal window (50ms in test config)
	time.Sleep(80 * time.Millisecond)

	// B → C (should be a separate flow since causal window expired)
	e.HandleEvent(makeRequestEvent("orders", "inventory", "GET", "/api/check", "10.0.0.2", "50001", "10.0.0.3", "8080"))

	flows := e.GetAllFlows()
	if len(flows) != 2 {
		t.Fatalf("expected 2 separate flows after window expiry, got %d", len(flows))
	}
}

func TestInFlightParentBeyondCausalWindow(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	// A → B, still unanswered
	e.HandleEvent(makeRequestEvent("gateway", "orders", "GET", "/api/checkout", "10.0.0.1", "50000", "10.0.0.2", "8080"))

	// B is still serving the request, so its call belongs to the same flow even
	// after the causal window (50ms) has passed.
	time.Sleep(80 * time.Millisecond)
	e.HandleEvent(makeRequestEvent("orders", "inventory", "GET", "/api/check", "10.0.0.2", "50001", "10.0.0.3", "8080"))

	flows := e.GetAllFlows()
	if len(flows) != 1 || len(flows[0].Calls) != 2 {
		t.Fatalf("expected 1 flow with 2 calls, got %d flows", len(flows))
	}
}

func TestConcurrentRequestsGetSeparateFlows(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	// Three clients hit the gateway at once; all three requests are in flight.
	for _, port := range []string{"50000", "50001", "50002"} {
		e.HandleEvent(makeRequestEvent("client", "gateway", "POST", "/api/orders", "10.0.0.1", port, "10.0.0.2", "8000"))
	}

	// Each gateway handler makes three sequential downstream calls: its first calls
	// go out together, then each handler makes its next call as soon as the
	// previous one returns, interleaved with the other handlers.
	port := 60000
	inflight := make([]string, 3)
	for h := 0; h < 3; h++ {
		inflight[h] = fmt.Sprint(port)
		e.HandleEvent(makeRequestEvent("gateway", "inventory", "GET", "/items", "10.0.0.2", inflight[h], "10.0.0.3", "8000"))
		port++
	}
	for round := 0; round < 2; round++ {
		for h := 0; h < 3; h++ {
			e.HandleEvent(makeResponseEvent("10.0.0.3", "8000", "10.0.0.2", inflight[h], "200", 1))
			inflight[h] = fmt.Sprint(port)
			e.HandleEvent(makeRequestEvent("gateway", "inventory", "GET", "/items", "10.0.0.2", inflight[h], "10.0.0.3", "8000"))
			port++
		}
	}

	flows := e.GetAllFlows()
	if len(flows) != 3 {
		t.Fatalf("expected 3 flows, got %d", len(flows))
	}
	for _, f := range flows {
		if len(f.Calls) != 4 {
			t.Errorf("flow %s has %d calls, want 4 (1 inbound + 3 downstream)", f.FlowID, len(f.Calls))
		}
		if f.Calls[0].Source != "client" {
			t.Errorf("flow %s root is %s->%s, want client->gateway", f.FlowID, f.Calls[0].Source, f.Calls[0].Destination)
		}
	}
}

func TestAnsweredRequestStopsCollectingCalls(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("client", "gateway", "GET", "/a", "10.0.0.1", "50000", "10.0.0.2", "8000"))
	e.HandleEvent(makeRequestEvent("client", "gateway", "GET", "/b", "10.0.0.1", "50001", "10.0.0.2", "8000"))
	// First request is answered; only the second is still being served.
	e.HandleEvent(makeResponseEvent("10.0.0.2", "8000", "10.0.0.1", "50000", "200", 1))
	time.Sleep(80 * time.Millisecond) // past the causal window

	e.HandleEvent(makeRequestEvent("gateway", "inventory", "GET", "/items", "10.0.0.2", "60000", "10.0.0.3", "8000"))

	for _, f := range e.GetAllFlows() {
		if f.Calls[0].Path == "/b" && len(f.Calls) != 2 {
			t.Errorf("downstream call should join the in-flight /b request")
		}
		if f.Calls[0].Path == "/a" && len(f.Calls) != 1 {
			t.Errorf("answered /a request should not collect more calls")
		}
	}
}

func TestTraceHeaderLinksFlows(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	withTrace := func(data []byte, traceID string) []byte {
		var ev RawEvent
		json.Unmarshal(data, &ev)
		ev.RequestHeaders = "Host: x\r\ntraceparent: 00-" + traceID + "-00f067aa0ba902b7-01"
		out, _ := json.Marshal(ev)
		return out
	}
	t1 := "4bf92f3577b34da6a3ce929d0e0e4736"
	t2 := "a1b2c3d4e5f60718293a4b5c6d7e8f90"

	e.HandleEvent(withTrace(makeRequestEvent("client", "gateway", "GET", "/one", "10.0.0.1", "50000", "10.0.0.2", "8000"), t1))
	e.HandleEvent(withTrace(makeRequestEvent("client", "gateway", "GET", "/two", "10.0.0.1", "50001", "10.0.0.2", "8000"), t2))
	// The in-flight heuristic would pick /one (oldest); the trace header says /two.
	e.HandleEvent(withTrace(makeRequestEvent("gateway", "inventory", "GET", "/items", "10.0.0.2", "60000", "10.0.0.3", "8000"), t2))

	for _, f := range e.GetAllFlows() {
		want := map[string]int{"/one": 1, "/two": 2}[f.Calls[0].Path]
		if len(f.Calls) != want {
			t.Errorf("flow rooted at %s has %d calls, want %d", f.Calls[0].Path, len(f.Calls), want)
		}
	}
}

func TestTraceIDFromHeaders(t *testing.T) {
	tests := map[string]string{
		"traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01": "4bf92f3577b34da6a3ce929d0e0e4736",
		"X-B3-TraceId: 80f198ee56343ba8":                                       "80f198ee56343ba8",
		"Host: a\r\nX-Request-ID: req-42":                                      "req-42",
		"x-correlation-id: corr-7":                                             "corr-7",
		"traceparent: garbage\r\nX-Request-ID: req-1":                          "req-1",
		"Host: a\r\nAccept: */*":                                               "",
	}
	for headers, want := range tests {
		if got := traceIDFromHeaders(headers); got != want {
			t.Errorf("traceIDFromHeaders(%q) = %q, want %q", headers, got, want)
		}
	}
}

func TestSelfCallDoesNotParentItself(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("worker", "worker", "GET", "/tick", "10.0.0.5", "50000", "10.0.0.5", "8000"))

	flows := e.GetAllFlows()
	if len(flows) != 1 || len(flows[0].Calls) != 1 {
		t.Fatalf("expected a single 1-call flow, got %d flows", len(flows))
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

func TestLateResponseAfterSettlingIsPublished(t *testing.T) {
	b := &mockBroadcaster{}
	// Settles after 100ms; pending requests live 5s (as in production, well past settling).
	e := NewEngineWithConfig(b, 50*time.Millisecond, 100*time.Millisecond, 5*time.Second)

	e.HandleEvent(makeRequestEvent("gateway", "stock", "GET", "/stock", "10.0.0.1", "50000", "10.0.0.2", "8000"))
	time.Sleep(700 * time.Millisecond) // settle (100ms) + maintenance tick (500ms)
	b.reset()

	e.HandleEvent(makeResponseEvent("10.0.0.2", "8000", "10.0.0.1", "50000", "200", 3))

	msg := b.lastMessage()
	if msg == nil || msg.Type != "flow_complete" {
		t.Fatalf("expected a flow_complete broadcast for the late response, got %+v", msg)
	}
	var flow Flow
	json.Unmarshal(msg.Payload, &flow)
	if flow.Calls[0].Status != "200" {
		t.Errorf("published call status = %q, want 200", flow.Calls[0].Status)
	}
}

func makeRedirectResponse(srcIP, srcPort, dstIP, dstPort, status, location string) []byte {
	event := RawEvent{
		EventType:       "response",
		Metadata:        map[string]string{},
		ResponseStatus:  status,
		ResponseHeaders: "Content-Length: 0\r\nLocation: " + location,
		SrcIP:           srcIP,
		SrcPort:         srcPort,
		DstIP:           dstIP,
		DstPort:         dstPort,
	}
	data, _ := json.Marshal(event)
	return data
}

// An OIDC authorization-code login driven by a browser on the Docker host:
// app redirects to the IdP, the user pauses on the login form (the flow settles),
// the form POST redirects to the app's callback, which exchanges the code
// server-side and redirects back to the protected page.
func TestOIDCLoginIsOneFlow(t *testing.T) {
	b := &mockBroadcaster{}
	e := NewEngineWithConfig(b, 50*time.Millisecond, 100*time.Millisecond, 5*time.Second)
	const host, app, idp = "10.0.0.1", "10.0.0.2", "10.0.0.3"

	// 1. Unauthenticated request; app redirects to the IdP with a state.
	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/protected", host, "50001", app, "8000"))
	e.HandleEvent(makeRedirectResponse(app, "8000", host, "50001", "302",
		"http://localhost:18081/auth?client_id=app&redirect_uri=http%3A%2F%2Flocalhost%3A18080%2Fcallback&state=S1"))
	// 2. Browser follows to the IdP, which shows the login form.
	e.HandleEvent(makeRequestEvent("host", "idp", "GET", "/auth?client_id=app&state=S1", host, "50002", idp, "8000"))
	e.HandleEvent(makeResponseEvent(idp, "8000", host, "50002", "200", 1))

	// The user takes a while to log in; the flow settles.
	time.Sleep(700 * time.Millisecond)

	// 3. Login form POST (no state, like Keycloak); redirects to the callback.
	e.HandleEvent(makeRequestEvent("host", "idp", "POST", "/login-actions/authenticate?session_code=x", host, "50003", idp, "8000"))
	e.HandleEvent(makeRedirectResponse(idp, "8000", host, "50003", "302", "http://localhost:18080/callback?code=C1&state=S1"))
	// 4. Callback: app exchanges the code at the IdP, then redirects to the page.
	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/callback?code=C1&state=S1", host, "50004", app, "8000"))
	e.HandleEvent(makeRequestEvent("app", "idp", "POST", "/token", app, "60001", idp, "8000"))
	e.HandleEvent(makeResponseEvent(idp, "8000", app, "60001", "200", 2))
	e.HandleEvent(makeRedirectResponse(app, "8000", host, "50004", "302", "/protected"))
	// 5. Browser lands on the protected page.
	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/protected", host, "50005", app, "8000"))

	flows := e.GetAllFlows()
	if len(flows) != 1 {
		for _, f := range flows {
			t.Logf("%s: %d calls, root %s", f.FlowID, len(f.Calls), f.Calls[0].Path)
		}
		t.Fatalf("expected the whole login in 1 flow, got %d", len(flows))
	}
	want := []string{"/protected", "/auth?client_id=app&state=S1", "/login-actions/authenticate?session_code=x",
		"/callback?code=C1&state=S1", "/token", "/protected"}
	f := flows[0]
	if len(f.Calls) != len(want) {
		t.Fatalf("got %d calls, want %d", len(f.Calls), len(want))
	}
	for i, c := range f.Calls {
		if c.Path != want[i] || c.Order != i {
			t.Errorf("call %d = %s (order %d), want %s", i, c.Path, c.Order, want[i])
		}
	}
	if f.Status != "active" {
		t.Errorf("reactivated flow status = %s, want active", f.Status)
	}

	removed := 0
	for _, raw := range b.messages {
		var msg WSMessage
		json.Unmarshal(raw, &msg)
		if msg.Type == "flow_removed" {
			removed++
		}
	}
	if removed != 1 {
		t.Errorf("expected 1 flow_removed broadcast for the merged login-form flow, got %d", removed)
	}
}

func TestRedirectOnlyLinksTheSameClient(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/old", "10.0.0.1", "50001", "10.0.0.2", "8000"))
	e.HandleEvent(makeRedirectResponse("10.0.0.2", "8000", "10.0.0.1", "50001", "301", "/new"))
	// A different client requesting the same path is unrelated.
	e.HandleEvent(makeRequestEvent("worker", "app", "GET", "/new", "10.0.0.9", "50002", "10.0.0.2", "8000"))
	// The redirected client following it joins the flow.
	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/new", "10.0.0.1", "50003", "10.0.0.2", "8000"))

	for _, f := range e.GetAllFlows() {
		root := f.Calls[0]
		switch root.Source {
		case "host":
			if len(f.Calls) != 2 {
				t.Errorf("host's redirect chain has %d calls, want 2", len(f.Calls))
			}
		case "worker":
			if len(f.Calls) != 1 {
				t.Errorf("unrelated worker request was linked into another flow")
			}
		}
	}
}

func TestNonRedirectResponseIsNotFollowed(t *testing.T) {
	b := &mockBroadcaster{}
	e := newTestEngine(b)

	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/a", "10.0.0.1", "50001", "10.0.0.2", "8000"))
	// A 200 that happens to carry a Location header is not a redirect.
	e.HandleEvent(makeRedirectResponse("10.0.0.2", "8000", "10.0.0.1", "50001", "200", "/b"))
	time.Sleep(80 * time.Millisecond) // past the causal window
	e.HandleEvent(makeRequestEvent("host", "app", "GET", "/b", "10.0.0.1", "50002", "10.0.0.2", "8000"))

	if n := len(e.GetAllFlows()); n != 2 {
		t.Errorf("expected 2 separate flows, got %d", n)
	}
}

func TestRingBufferRemove(t *testing.T) {
	rb := newRingBuffer(3)
	for _, id := range []string{"A", "B", "C", "D"} {
		rb.Push(&Flow{FlowID: id})
	}
	rb.Remove("C")
	rb.Remove("missing")
	all := rb.All()
	if len(all) != 2 || all[0].FlowID != "B" || all[1].FlowID != "D" {
		t.Errorf("after removing C got %v", all)
	}
	rb.Push(&Flow{FlowID: "E"})
	if all = rb.All(); len(all) != 3 || all[2].FlowID != "E" {
		t.Errorf("push after remove got %v", all)
	}
}
