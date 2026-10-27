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
