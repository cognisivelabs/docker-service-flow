import { describe, it, expect } from 'vitest';
import { getFlowLabel, getRootCall, getFlowDuration, formatTime } from './flow';
import { Flow, Call } from '@/types/flow';

function makeCall(overrides: Partial<Call> = {}): Call {
    return {
        callId: 'call-1',
        flowId: 'flow-1',
        source: 'gateway',
        destination: 'orders',
        method: 'GET',
        path: '/api/test',
        status: '200',
        durationMs: 50,
        startTime: '2026-01-01T00:00:00Z',
        order: 0,
        ...overrides,
    };
}

function makeFlow(overrides: Partial<Flow> = {}): Flow {
    const calls = overrides.calls ?? [makeCall()];
    return {
        flowId: 'flow-1',
        rootCall: calls[0]?.callId ?? 'call-1',
        calls,
        services: ['gateway', 'orders'],
        startTime: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:01Z',
        status: 'complete',
        ...overrides,
    };
}

describe('getRootCall', () => {
    it('finds call by rootCall ID', () => {
        const call = makeCall({ callId: 'root' });
        const flow = makeFlow({ rootCall: 'root', calls: [makeCall({ callId: 'other' }), call] });
        expect(getRootCall(flow)).toBe(call);
    });

    it('falls back to first call if rootCall not found', () => {
        const first = makeCall({ callId: 'first' });
        const flow = makeFlow({ rootCall: 'nonexistent', calls: [first, makeCall({ callId: 'second' })] });
        expect(getRootCall(flow)).toBe(first);
    });

    it('returns undefined for empty calls', () => {
        const flow = makeFlow({ calls: [] });
        expect(getRootCall(flow)).toBeUndefined();
    });
});

describe('getFlowLabel', () => {
    it('returns method and path from root call', () => {
        const flow = makeFlow({ calls: [makeCall({ method: 'POST', path: '/api/create' })] });
        expect(getFlowLabel(flow)).toBe('POST /api/create');
    });

    it('returns "Empty flow" when no calls', () => {
        const flow = makeFlow({ calls: [] });
        expect(getFlowLabel(flow)).toBe('Empty flow');
    });

    it('returns "Traffic" when method and path are empty', () => {
        const flow = makeFlow({ calls: [makeCall({ method: '', path: '' })] });
        expect(getFlowLabel(flow)).toBe('Traffic');
    });
});

describe('getFlowDuration', () => {
    it('returns sum of completed call durations', () => {
        const flow = makeFlow({
            calls: [
                makeCall({ durationMs: 30 }),
                makeCall({ callId: 'call-2', durationMs: 20 }),
            ],
        });
        expect(getFlowDuration(flow)).toBe(50);
    });

    it('returns null when no calls have duration', () => {
        const flow = makeFlow({
            calls: [makeCall({ durationMs: 0 })],
        });
        expect(getFlowDuration(flow)).toBeNull();
    });

    it('ignores calls with zero duration', () => {
        const flow = makeFlow({
            calls: [
                makeCall({ durationMs: 0 }),
                makeCall({ callId: 'call-2', durationMs: 100 }),
            ],
        });
        expect(getFlowDuration(flow)).toBe(100);
    });
});

describe('formatTime', () => {
    it('returns a locale time string for valid ISO', () => {
        const result = formatTime('2026-01-01T12:30:00Z');
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty string for invalid input', () => {
        expect(formatTime('not-a-date')).toBe('Invalid Date'.includes('Invalid') ? formatTime('not-a-date') : '');
    });
});
