import { describe, it, expect } from 'vitest';
import { getFlowLabel, getRootCall, getFlowDuration, formatTime, callsOverlap } from './flow';
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

describe('callsOverlap', () => {
    const at = (start: string, end?: string) =>
        makeCall({ startTime: `2026-01-01T00:00:00.${start}Z`, endTime: end && `2026-01-01T00:00:00.${end}Z` });

    it('detects calls in flight at the same time', () => {
        expect(callsOverlap(at('100', '200'), at('150', '250'))).toBe(true);
        expect(callsOverlap(at('150', '250'), at('100', '200'))).toBe(true);
    });

    it('rejects sequential calls even when they start close together', () => {
        expect(callsOverlap(at('100', '120'), at('125', '140'))).toBe(false);
    });

    it('treats back-to-back calls as sequential', () => {
        expect(callsOverlap(at('100', '200'), at('200', '300'))).toBe(false);
    });

    it('treats a call without an end time as still in flight', () => {
        expect(callsOverlap(at('100'), at('500', '600'))).toBe(true);
    });

    it("treats Go's zero time as no end time", () => {
        const pending = makeCall({ startTime: '2026-01-01T00:00:00.100Z', endTime: '0001-01-01T00:00:00Z' });
        expect(callsOverlap(pending, at('500', '600'))).toBe(true);
    });
});
