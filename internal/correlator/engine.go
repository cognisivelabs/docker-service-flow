package correlator

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	defaultCausalWindow   = 200 * time.Millisecond
	defaultSettlingWindow = 2 * time.Second
	defaultRequestTTL     = 30 * time.Second
	defaultRingCapacity   = 200

	// A browser follows a redirect immediately; allow for slow hops.
	redirectFollowWindow = 10 * time.Second
	// An OAuth login can pause on a login form; link its callback for this long.
	oauthStateTTL = 10 * time.Minute
)

// Broadcaster is the interface the engine uses to send messages to clients.
type Broadcaster interface {
	Send(data []byte)
}

// RawEvent is the event format received from the sniffer via HTTP POST.
type RawEvent struct {
	EventType       string            `json:"eventType"`
	Source          string            `json:"source"`
	Destination     string            `json:"destination"`
	Metadata        map[string]string `json:"metadata"`
	RequestBody     string            `json:"requestBody,omitempty"`
	RequestHeaders  string            `json:"requestHeaders,omitempty"`
	ResponseStatus  string            `json:"status,omitempty"`
	ResponseHeaders string            `json:"responseHeaders,omitempty"`
	ResponseBody    string            `json:"responseBody,omitempty"`
	DurationMs      int64             `json:"durationMs,omitempty"`
	SrcIP           string            `json:"srcIP,omitempty"`
	SrcPort         string            `json:"srcPort,omitempty"`
	DstIP           string            `json:"dstIP,omitempty"`
	DstPort         string            `json:"dstPort,omitempty"`
}

type Engine struct {
	mu             sync.Mutex
	pendingCalls   map[string]*Call         // tcpKey → Call awaiting response
	serviceWindow  map[string]*serviceEntry // serviceName → most recent call where service was destination
	traceFlows     map[string]*Flow         // propagated trace ID → active flow
	redirects      []redirectHint           // recent 3xx responses awaiting the client's follow-up
	oauthStates    map[string]stateHint     // OAuth state from a redirect → flow that issued it
	activeFlows    map[string]*Flow         // flowId → active flow
	completedFlows ringBuffer               // completed flows ring buffer
	callCounter    int                      // for generating call IDs
	flowCounter    int                      // for generating flow IDs
	broadcaster    Broadcaster

	causalWindow   time.Duration
	settlingWindow time.Duration
	requestTTL     time.Duration
}

type serviceEntry struct {
	call      *Call
	flow      *Flow
	timestamp time.Time
}

// redirectHint is a redirect a client is expected to follow with a request to path.
type redirectHint struct {
	client string
	path   string
	flow   *Flow
	at     time.Time
}

type stateHint struct {
	flow *Flow
	at   time.Time
}

func NewEngine(broadcaster Broadcaster) *Engine {
	return NewEngineWithConfig(broadcaster, defaultCausalWindow, defaultSettlingWindow, defaultRequestTTL)
}

func NewEngineWithConfig(broadcaster Broadcaster, causalWindow, settlingWindow, requestTTL time.Duration) *Engine {
	e := &Engine{
		pendingCalls:   make(map[string]*Call),
		serviceWindow:  make(map[string]*serviceEntry),
		traceFlows:     make(map[string]*Flow),
		oauthStates:    make(map[string]stateHint),
		activeFlows:    make(map[string]*Flow),
		completedFlows: newRingBuffer(defaultRingCapacity),
		broadcaster:    broadcaster,
		causalWindow:   causalWindow,
		settlingWindow: settlingWindow,
		requestTTL:     requestTTL,
	}
	go e.maintenanceLoop()
	return e
}

func (e *Engine) HandleEvent(raw []byte) error {
	var event RawEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		log.Printf("Correlator: failed to parse event: %v", err)
		return fmt.Errorf("invalid event JSON: %w", err)
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	switch event.EventType {
	case "request":
		e.handleRequest(event)
	case "response":
		e.handleResponse(event)
	default:
		log.Printf("Correlator: unknown event type: %s", event.EventType)
	}
	return nil
}

func (e *Engine) handleRequest(event RawEvent) {
	now := time.Now()
	tcpKey := fmt.Sprintf("%s:%s-%s:%s", event.SrcIP, event.SrcPort, event.DstIP, event.DstPort)

	e.callCounter++
	call := &Call{
		CallID:         fmt.Sprintf("call-%d", e.callCounter),
		Source:         event.Source,
		Destination:    event.Destination,
		Method:         event.Metadata["method"],
		Path:           event.Metadata["path"],
		Status:         "pending",
		StartTime:      now,
		RequestHeaders: event.RequestHeaders,
		RequestBody:    event.RequestBody,
		SrcIP:          event.SrcIP,
		SrcPort:        event.SrcPort,
		DstIP:          event.DstIP,
		DstPort:        event.DstPort,
		seq:            e.callCounter,
		traceID:        traceIDFromHeaders(event.RequestHeaders),
	}

	// Find the parent before registering this call, so a self-call can't pick itself.
	flow := e.findParentFlow(call, now)

	// Store for response matching
	e.pendingCalls[tcpKey] = call

	if flow != nil {
		call.FlowID = flow.FlowID
		call.Order = len(flow.Calls)
		flow.Calls = append(flow.Calls, call)
		flow.UpdatedAt = now
		addUniqueService(flow, event.Destination)
	} else {
		e.flowCounter++
		flow = &Flow{
			FlowID:    fmt.Sprintf("flow-%d", e.flowCounter),
			RootCall:  call.CallID,
			Calls:     []*Call{call},
			Services:  []string{event.Source, event.Destination},
			StartTime: now,
			UpdatedAt: now,
			Status:    "active",
		}
		call.FlowID = flow.FlowID
		call.Order = 0
		e.activeFlows[flow.FlowID] = flow
	}
	if call.traceID != "" {
		e.traceFlows[call.traceID] = flow
	}

	// Mark destination as having received a request (for causal chaining)
	e.serviceWindow[event.Destination] = &serviceEntry{
		call:      call,
		flow:      flow,
		timestamp: now,
	}

	e.broadcast("flow_update", flow)
}

// findParentFlow decides which active flow a new call belongs to, or nil for a new flow.
// In order of confidence:
//  1. A propagated trace/request ID shared with a call in an active flow.
//  2. A redirect: a client following a 3xx it just received, or presenting the
//     OAuth state issued in an earlier redirect (linking a login's callback to
//     its start across the login form).
//  3. A request the caller has received but not yet answered (it's making this call
//     while serving it). Packets alone can't tell which of several concurrent
//     requests a call serves, so calls are spread across them: fewest attributed
//     calls first, then oldest. This gives each concurrent request its own flow of
//     roughly the right size; exact attribution needs (1).
//  4. A request the caller received within the causal window, for calls made after
//     it already responded.
func (e *Engine) findParentFlow(call *Call, now time.Time) *Flow {
	if call.traceID != "" {
		if flow, ok := e.traceFlows[call.traceID]; ok {
			return flow
		}
	}

	if flow := e.redirectFlow(call, now); flow != nil {
		return flow
	}

	var parent *Call
	for _, c := range e.pendingCalls {
		if c.Destination != call.Source || now.Sub(c.StartTime) > e.requestTTL {
			continue
		}
		if _, active := e.activeFlows[c.FlowID]; !active {
			continue
		}
		if parent == nil || betterParent(c, parent) {
			parent = c
		}
	}
	if parent != nil {
		parent.children++
		return e.activeFlows[parent.FlowID]
	}

	if entry, ok := e.serviceWindow[call.Source]; ok && now.Sub(entry.timestamp) <= e.causalWindow {
		if _, active := e.activeFlows[entry.flow.FlowID]; active {
			return entry.flow
		}
	}
	return nil
}

// betterParent reports whether candidate a should take the next call before b.
func betterParent(a, b *Call) bool {
	if a.children != b.children {
		return a.children < b.children
	}
	return a.seq < b.seq
}

// traceIDFromHeaders extracts a propagated trace or request ID from raw request headers.
func traceIDFromHeaders(headers string) string {
	values := headerValues(headers)
	// W3C trace context: version-traceid-parentid-flags
	if parts := strings.Split(values["traceparent"], "-"); len(parts) == 4 && len(parts[1]) == 32 {
		return parts[1]
	}
	for _, h := range []string{"x-b3-traceid", "x-request-id", "x-correlation-id"} {
		if v := values[h]; v != "" {
			return v
		}
	}
	return ""
}

// headerValues parses raw headers into a map keyed by lowercase name.
func headerValues(headers string) map[string]string {
	values := make(map[string]string)
	for _, line := range strings.Split(headers, "\r\n") {
		k, v, ok := strings.Cut(line, ":")
		if ok {
			values[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
		}
	}
	return values
}

func (e *Engine) handleResponse(event RawEvent) {
	now := time.Now()
	// Response comes on the reverse path
	tcpKey := fmt.Sprintf("%s:%s-%s:%s", event.DstIP, event.DstPort, event.SrcIP, event.SrcPort)

	call, ok := e.pendingCalls[tcpKey]
	if !ok {
		log.Printf("Correlator: unmatched response for key %s", tcpKey)
		return
	}
	delete(e.pendingCalls, tcpKey)

	call.Status = event.ResponseStatus
	call.DurationMs = event.DurationMs
	call.ResponseHeaders = event.ResponseHeaders
	call.ResponseBody = event.ResponseBody
	call.EndTime = now

	flow, active := e.activeFlows[call.FlowID]
	if !active {
		flow = e.completedFlows.Find(call.FlowID)
	}
	if flow == nil {
		return
	}
	if location := redirectLocation(call); location != "" {
		e.recordRedirect(call.Source, location, flow, now)
	}
	if !active {
		// The flow settled before this response arrived; still publish the result
		// so the call doesn't show as pending forever.
		e.broadcast("flow_complete", flow)
		return
	}
	flow.UpdatedAt = now

	e.broadcast("flow_update", flow)
}

// redirectLocation returns the Location of a 3xx response, or "".
func redirectLocation(call *Call) string {
	if !strings.HasPrefix(call.Status, "3") {
		return ""
	}
	return headerValues(call.ResponseHeaders)["location"]
}

// recordRedirect remembers a redirect so the client's follow-up request, and a
// later request presenting its OAuth state, join the same flow.
func (e *Engine) recordRedirect(client, location string, flow *Flow, now time.Time) {
	u, err := url.Parse(location)
	if err != nil {
		return
	}
	e.redirects = append(e.redirects, redirectHint{client: client, path: pathOrRoot(u.Path), flow: flow, at: now})
	// The first redirect carrying a state is the authorization request; the IdP's
	// redirect back to the callback echoes it and must not take it over.
	if state := u.Query().Get("state"); state != "" {
		if _, seen := e.oauthStates[state]; !seen {
			e.oauthStates[state] = stateHint{flow: flow, at: now}
		}
	}
}

// redirectFlow returns the flow a request continues as part of a redirect chain,
// or nil. If it both follows a redirect and presents an OAuth state from a
// different flow (a login form's POST started its own flow), the two merge.
func (e *Engine) redirectFlow(call *Call, now time.Time) *Flow {
	u, err := url.Parse(call.Path)
	if err != nil {
		return nil
	}

	var viaState, viaRedirect *Flow
	if state := u.Query().Get("state"); state != "" {
		if h, ok := e.oauthStates[state]; ok && now.Sub(h.at) <= oauthStateTTL {
			viaState = h.flow
		}
	}
	path := pathOrRoot(u.Path)
	for i := len(e.redirects) - 1; i >= 0; i-- {
		h := e.redirects[i]
		if h.client == call.Source && h.path == path && now.Sub(h.at) <= redirectFollowWindow {
			viaRedirect = h.flow
			e.redirects = append(e.redirects[:i], e.redirects[i+1:]...)
			break
		}
	}

	switch {
	case viaState != nil:
		if viaRedirect != nil && viaRedirect != viaState {
			e.mergeFlows(viaState, viaRedirect, now)
		}
		return e.reactivate(viaState)
	case viaRedirect != nil:
		return e.reactivate(viaRedirect)
	}
	return nil
}

// reactivate makes a settled flow active again so it can take more calls.
func (e *Engine) reactivate(flow *Flow) *Flow {
	if _, active := e.activeFlows[flow.FlowID]; !active {
		e.completedFlows.Remove(flow.FlowID)
		flow.Status = "active"
		e.activeFlows[flow.FlowID] = flow
	}
	return flow
}

// mergeFlows moves src's calls into dst, keeping time order, and retires src.
func (e *Engine) mergeFlows(dst, src *Flow, now time.Time) {
	for _, c := range src.Calls {
		c.FlowID = dst.FlowID
		dst.Calls = append(dst.Calls, c)
	}
	sort.SliceStable(dst.Calls, func(i, j int) bool {
		if !dst.Calls[i].StartTime.Equal(dst.Calls[j].StartTime) {
			return dst.Calls[i].StartTime.Before(dst.Calls[j].StartTime)
		}
		return dst.Calls[i].seq < dst.Calls[j].seq
	})
	for i, c := range dst.Calls {
		c.Order = i
	}
	for _, s := range src.Services {
		addUniqueService(dst, s)
	}
	dst.UpdatedAt = now

	delete(e.activeFlows, src.FlowID)
	e.completedFlows.Remove(src.FlowID)
	for id, f := range e.traceFlows {
		if f == src {
			e.traceFlows[id] = dst
		}
	}
	for st, h := range e.oauthStates {
		if h.flow == src {
			e.oauthStates[st] = stateHint{flow: dst, at: h.at}
		}
	}
	for i := range e.redirects {
		if e.redirects[i].flow == src {
			e.redirects[i].flow = dst
		}
	}
	for _, entry := range e.serviceWindow {
		if entry.flow == src {
			entry.flow = dst
		}
	}
	e.broadcast("flow_removed", &Flow{FlowID: src.FlowID})
}

func pathOrRoot(p string) string {
	if p == "" {
		return "/"
	}
	return p
}

func (e *Engine) maintenanceLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		e.mu.Lock()
		now := time.Now()

		// Settle active flows with no recent activity
		for id, flow := range e.activeFlows {
			if now.Sub(flow.UpdatedAt) > e.settlingWindow {
				flow.Status = "complete"
				e.completedFlows.Push(flow)
				delete(e.activeFlows, id)
				for _, call := range flow.Calls {
					if call.traceID != "" && e.traceFlows[call.traceID] == flow {
						delete(e.traceFlows, call.traceID)
					}
				}
				e.broadcast("flow_complete", flow)
			}
		}

		// Clean stale pending calls (memory leak fix)
		for key, call := range e.pendingCalls {
			if now.Sub(call.StartTime) > e.requestTTL {
				call.Status = "timeout"
				delete(e.pendingCalls, key)
			}
		}

		// Drop redirect hints nobody followed, and expired OAuth states
		kept := e.redirects[:0]
		for _, h := range e.redirects {
			if now.Sub(h.at) <= redirectFollowWindow {
				kept = append(kept, h)
			}
		}
		e.redirects = kept
		for st, h := range e.oauthStates {
			if now.Sub(h.at) > oauthStateTTL {
				delete(e.oauthStates, st)
			}
		}

		// Clean stale service window entries
		for svc, entry := range e.serviceWindow {
			if now.Sub(entry.timestamp) > e.causalWindow {
				delete(e.serviceWindow, svc)
			}
		}

		e.mu.Unlock()
	}
}

// GetAllFlows returns completed + active flows for initial client sync.
func (e *Engine) GetAllFlows() []*Flow {
	e.mu.Lock()
	defer e.mu.Unlock()

	result := make([]*Flow, 0, e.completedFlows.Len()+len(e.activeFlows))
	result = append(result, e.completedFlows.All()...)
	for _, flow := range e.activeFlows {
		result = append(result, flow)
	}
	return result
}

func (e *Engine) broadcast(msgType string, flow *Flow) {
	data, err := NewWSMessage(msgType, flow)
	if err != nil {
		log.Printf("Correlator: failed to marshal message: %v", err)
		return
	}
	e.broadcaster.Send(data)
}

func addUniqueService(flow *Flow, service string) {
	for _, s := range flow.Services {
		if s == service {
			return
		}
	}
	flow.Services = append(flow.Services, service)
}

// --- Ring Buffer ---

type ringBuffer struct {
	items []*Flow
	head  int
	count int
	cap   int
}

func newRingBuffer(capacity int) ringBuffer {
	return ringBuffer{
		items: make([]*Flow, capacity),
		cap:   capacity,
	}
}

func (rb *ringBuffer) Push(flow *Flow) {
	rb.items[rb.head] = flow
	rb.head = (rb.head + 1) % rb.cap
	if rb.count < rb.cap {
		rb.count++
	}
}

// Find returns the stored flow with the given ID, or nil if it has been evicted.
func (rb *ringBuffer) Find(flowID string) *Flow {
	for _, f := range rb.items {
		if f != nil && f.FlowID == flowID {
			return f
		}
	}
	return nil
}

// Remove deletes the flow with the given ID, if present.
func (rb *ringBuffer) Remove(flowID string) {
	kept := rb.All()
	for i, f := range kept {
		if f.FlowID == flowID {
			kept = append(kept[:i], kept[i+1:]...)
			*rb = newRingBuffer(rb.cap)
			for _, k := range kept {
				rb.Push(k)
			}
			return
		}
	}
}

func (rb *ringBuffer) Len() int {
	return rb.count
}

func (rb *ringBuffer) All() []*Flow {
	result := make([]*Flow, 0, rb.count)
	start := (rb.head - rb.count + rb.cap) % rb.cap
	for i := 0; i < rb.count; i++ {
		idx := (start + i) % rb.cap
		result = append(result, rb.items[idx])
	}
	return result
}
