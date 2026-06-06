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
