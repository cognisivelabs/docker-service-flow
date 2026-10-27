import { describe, it, expect, vi } from 'vitest';
import { parseWSFrame } from './ws';

const update = (flowId: string) => JSON.stringify({ type: 'flow_update', payload: { flowId } });

describe('parseWSFrame', () => {
    it('parses a single message', () => {
        expect(parseWSFrame(update('a'))).toEqual([{ type: 'flow_update', payload: { flowId: 'a' } }]);
    });

    it('splits newline-batched messages', () => {
        const frame = [update('a'), update('b'), update('c')].join('\n');
        expect(parseWSFrame(frame).map(m => m.type === 'flow_update' && m.payload.flowId)).toEqual(['a', 'b', 'c']);
    });

    it('keeps escaped newlines inside string values', () => {
        const msg = JSON.stringify({ type: 'flow_update', payload: { flowId: 'a', note: 'line1\nline2' } });
        const [parsed] = parseWSFrame(msg + '\n' + update('b'));
        expect(parsed).toMatchObject({ payload: { note: 'line1\nline2' } });
    });

    it('skips a malformed line without dropping the rest', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const frame = [update('a'), '{not json', update('b')].join('\n');
        expect(parseWSFrame(frame)).toHaveLength(2);
        expect(spy).toHaveBeenCalledOnce();
        spy.mockRestore();
    });

    it('ignores blank lines', () => {
        expect(parseWSFrame('\n' + update('a') + '\n\n')).toHaveLength(1);
    });
});
