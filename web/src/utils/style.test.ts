import { describe, it, expect } from 'vitest';
import { getStatusColor, getMethodBadgeClasses, isErrorStatus } from './style';

describe('getStatusColor', () => {
    it('returns emerald for 2xx', () => {
        expect(getStatusColor('200')).toContain('emerald');
        expect(getStatusColor('201')).toContain('emerald');
    });

    it('returns amber pulse for pending', () => {
        const result = getStatusColor('pending');
        expect(result).toContain('amber');
        expect(result).toContain('animate-pulse');
    });

    it('returns red for timeout', () => {
        expect(getStatusColor('timeout')).toContain('red');
    });

    it('returns red for 4xx', () => {
        expect(getStatusColor('404')).toContain('red');
        expect(getStatusColor('403')).toContain('red');
    });

    it('returns red for 5xx', () => {
        expect(getStatusColor('500')).toContain('red');
        expect(getStatusColor('503')).toContain('red');
    });

    it('returns slate for unknown status', () => {
        expect(getStatusColor('unknown')).toContain('slate');
    });
});

describe('getMethodBadgeClasses', () => {
    it('returns blue for GET', () => {
        expect(getMethodBadgeClasses('GET')).toContain('blue');
    });

    it('returns green for POST', () => {
        expect(getMethodBadgeClasses('POST')).toContain('green');
    });

    it('returns yellow for PUT', () => {
        expect(getMethodBadgeClasses('PUT')).toContain('yellow');
    });

    it('returns red for DELETE', () => {
        expect(getMethodBadgeClasses('DELETE')).toContain('red');
    });

    it('returns slate for unknown method', () => {
        expect(getMethodBadgeClasses('PATCH')).toContain('slate');
    });
});

describe('isErrorStatus', () => {
    it('returns true for 4xx', () => {
        expect(isErrorStatus('400')).toBe(true);
        expect(isErrorStatus('404')).toBe(true);
        expect(isErrorStatus('422')).toBe(true);
    });

    it('returns true for 5xx', () => {
        expect(isErrorStatus('500')).toBe(true);
        expect(isErrorStatus('502')).toBe(true);
    });

    it('returns false for 2xx', () => {
        expect(isErrorStatus('200')).toBe(false);
        expect(isErrorStatus('201')).toBe(false);
    });

    it('returns false for non-numeric status', () => {
        expect(isErrorStatus('pending')).toBe(false);
        expect(isErrorStatus('timeout')).toBe(false);
    });
});
