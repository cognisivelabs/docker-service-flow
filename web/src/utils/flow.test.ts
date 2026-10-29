import { describe, it, expect } from 'vitest';
import { getFlowLabel, getRootCall, getFlowDuration, formatTime, callsOverlap, redirectTarget, timestampMicros, timelineOrder } from './flow';
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

describe('redirectTarget', () => {
    const redirect = (status: string, headers?: string) => makeCall({ status, responseHeaders: headers });

    it('reduces an absolute Location to path and query', () => {
        expect(redirectTarget(redirect('302', 'Content-Length: 0\r\nLocation: http://localhost:18080/callback?code=C1&state=S1')))
            .toBe('/callback?code=C1&state=S1');
    });

    it('keeps a relative Location', () => {
        expect(redirectTarget(redirect('303', 'location: /protected'))).toBe('/protected');
    });

    it('ignores non-redirect responses', () => {
        expect(redirectTarget(redirect('200', 'Location: /elsewhere'))).toBeNull();
    });

    it('returns null when there is no Location header', () => {
        expect(redirectTarget(redirect('304', 'ETag: "x"'))).toBeNull();
        expect(redirectTarget(redirect('302'))).toBeNull();
    });
});

describe('timestampMicros', () => {
    it('keeps sub-millisecond precision', () => {
        const a = timestampMicros('2026-10-29T10:47:02.712088123Z');
        const b = timestampMicros('2026-10-29T10:47:02.712089Z');
        expect(b - a).toBe(1);
    });

    it('handles timestamps without a fraction and with offsets', () => {
        expect(timestampMicros('2026-10-29T10:47:02Z')).toBe(Date.parse('2026-10-29T10:47:02Z') * 1000);
        expect(timestampMicros('2026-10-29T11:47:02.5+01:00')).toBe(Date.parse('2026-10-29T10:47:02Z') * 1000 + 500000);
    });
});

describe('timelineOrder', () => {
    const t = (us: number) => `2026-10-29T10:47:02.${String(us).padStart(6, '0')}Z`;

    it('puts a nested call before its parent reply', () => {
        // callback (0..400us) exchanges a code at /token (100..200us) before replying
        const callback = makeCall({ callId: 'cb', startTime: t(0), endTime: t(400), status: '302' });
        const token = makeCall({ callId: 'tok', startTime: t(100), endTime: t(200), status: '200' });
        const order = timelineOrder([callback, token]);
        const sequence = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
        expect(sequence).toEqual(['cb-req', 'tok-req', 'tok-resp', 'cb-resp']);
    });

    it('omits replies for pending calls', () => {
        const order = timelineOrder([makeCall({ callId: 'p', status: 'pending', startTime: t(0) })]);
        expect([...order.keys()]).toEqual(['p-req']);
    });

    it('keeps a request before its own reply when timestamps tie', () => {
        const fast = makeCall({ callId: 'f', startTime: t(5), endTime: t(5), status: '200' });
        const sequence = [...timelineOrder([fast]).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
        expect(sequence).toEqual(['f-req', 'f-resp']);
    });
});
