import { Flow, Call } from '@/types/flow';

export function getRootCall(flow: Flow): Call | undefined {
    return flow.calls.find(c => c.callId === flow.rootCall) ?? flow.calls[0];
}

export function getFlowLabel(flow: Flow): string {
    const root = getRootCall(flow);
    if (!root) return 'Empty flow';
    return `${root.method} ${root.path}`.trim() || 'Traffic';
}

export function getFlowDuration(flow: Flow): number | null {
    const completed = flow.calls.filter(c => c.durationMs > 0);
    if (completed.length === 0) return null;
    return completed.reduce((sum, c) => sum + c.durationMs, 0);
}

export function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return '';
    }
}

/**
 * End time of a call in ms. Calls still in flight (no endTime, or Go's zero
 * time) are treated as open-ended.
 */
function callEndMs(call: Call, startMs: number): number {
    const end = call.endTime ? new Date(call.endTime).getTime() : NaN;
    return Number.isNaN(end) || end < startMs ? Infinity : end;
}

/** True if the two calls were in flight at the same time. */
export function callsOverlap(a: Call, b: Call): boolean {
    const aStart = new Date(a.startTime).getTime();
    const bStart = new Date(b.startTime).getTime();
    return aStart < callEndMs(b, bStart) && bStart < callEndMs(a, aStart);
}

/**
 * Path a redirect response points to (from its Location header), or null if the
 * call isn't a 3xx redirect. Absolute URLs are reduced to their path and query.
 */
export function redirectTarget(call: Call): string | null {
    if (!call.status.startsWith('3') || !call.responseHeaders) return null;
    const line = call.responseHeaders.split('\r\n').find(l => /^location\s*:/i.test(l));
    if (!line) return null;
    const location = line.slice(line.indexOf(':') + 1).trim();
    try {
        const url = new URL(location, 'http://placeholder');
        return url.pathname + url.search;
    } catch {
        return location;
    }
}

/**
 * Microseconds since the epoch for an RFC 3339 timestamp, keeping the sub-millisecond
 * digits the server sends (Date only keeps milliseconds). NaN if unparseable.
 */
export function timestampMicros(iso: string): number {
    const fraction = iso.match(/\.(\d+)/)?.[1] ?? '';
    const wholeSeconds = Date.parse(iso.replace(/\.\d+/, ''));
    return wholeSeconds * 1000 + Number((fraction + '000000').slice(0, 6));
}

/**
 * Diagram position for each request and reply arrow, by when it actually happened:
 * a request at its start, a reply at its end. This keeps calls made while handling
 * a request (e.g. a callback exchanging a code) before that request's reply.
 * Keys are `${callId}-req` and `${callId}-resp`.
 */
export function timelineOrder(calls: Call[]): Map<string, number> {
    const events: { id: string; t: number; index: number; reply: boolean }[] = [];
    calls.forEach((call, index) => {
        events.push({ id: `${call.callId}-req`, t: timestampMicros(call.startTime), index, reply: false });
        if (call.status && call.status !== 'pending' && call.endTime) {
            const end = timestampMicros(call.endTime);
            if (!Number.isNaN(end) && end > 0) {
                events.push({ id: `${call.callId}-resp`, t: end, index, reply: true });
            }
        }
    });
    events.sort((a, b) =>
        (a.t - b.t) || (a.index - b.index) || (Number(a.reply) - Number(b.reply)));
    return new Map(events.map((e, i) => [e.id, i]));
}
