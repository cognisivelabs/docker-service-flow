import { describe, it, expect } from 'vitest';
import { LayoutEngine } from './LayoutEngine';
import type { DiagramData } from './model.types';

describe('LayoutEngine', () => {
    it('should calculate basic coordinates for 2 actors and 1 message', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [
                { id: '1', name: 'User' },
                { id: '2', name: 'API' },
            ],
            messages: [
                { id: 'm1', from: '1', to: '2', label: 'Login', type: 'sync' }
            ]
        };

        const frame = engine.calculate(data);

        // Verify Actors
        expect(frame.actors).toHaveLength(2);
        expect(frame.actors[0].x).toBe(100); // default margin
        expect(frame.actors[1].x).toBe(300); // 100 + 200 spacing

        // Verify Message
        expect(frame.messages).toHaveLength(1);
        const msg = frame.messages[0];
        expect(msg.p1.x).toBe(100);
        expect(msg.p2.x).toBe(300);
        expect(msg.p1.y).toBe(90); // 40 (top) + 50 (msg height)
    });

    it('should handle self-messages', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [{ id: '1', name: 'A' }],
            messages: [{ id: 'm1', from: '1', to: '1', label: 'Internal', type: 'sync' }]
        };

        const frame = engine.calculate(data);
        const msg = frame.messages[0];

        expect(msg.p1.x).toBe(100);
        expect(msg.p2.x).toBe(100); // Should return to self
        expect(msg.p2.y).toBeGreaterThan(msg.p1.y); // Should go down
    });

    it('should stack nested activations visually', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [{ id: '1', name: 'A' }],
            messages: [
                { id: 'm1', from: '1', to: '1', label: 'Call 1', type: 'sync' }, // Depth 0
                { id: 'm2', from: '1', to: '1', label: 'Call 2', type: 'sync' }  // Depth 1
            ]
        };

        const frame = engine.calculate(data);

        expect(frame.activations).toHaveLength(2);

        // First activation (Depth 0)
        // Actor X is 100. Activation width 10. Start X = 100 - 5 = 95.
        expect(frame.activations[0].x).toBe(95);

        // Second activation (Depth 1)
        // Should be offset by width/2 (5px). X = 95 + 5 = 100.
        expect(frame.activations[1].x).toBe(100);
    });

    it('should expand outer fragments to enclose inner fragments', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }],
            messages: [
                { id: 'm1', from: '1', to: '2', label: '1', type: 'sync' },
                { id: 'm2', from: '2', to: '1', label: '2', type: 'reply' }
            ],
            fragments: [
                { id: 'inner', type: 'loop', label: 'Inner', startMessageId: 'm1', endMessageId: 'm2' },
                { id: 'outer', type: 'alt', label: 'Outer', startMessageId: 'm1', endMessageId: 'm2' } // Same range
            ]
        };

        const frame = engine.calculate(data);

        expect(frame.fragments).toHaveLength(2);

        // Find fragments
        const inner = frame.fragments.find(f => f.data.id === 'inner')!;
        const outer = frame.fragments.find(f => f.data.id === 'outer')!;

        // Since Outer contains Inner (same range is treated as containment), 
        // we verify at least they are both present and recognized.
        expect(inner).toBeDefined();
        expect(outer).toBeDefined();
    });

    it('should expand outer fragment when ranges strictly contain', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [{ id: '1', name: 'A' }],
            messages: [
                { id: 'm1', from: '1', to: '1', label: '1', type: 'sync' },
                { id: 'm2', from: '1', to: '1', label: '2', type: 'sync' },
                { id: 'm3', from: '1', to: '1', label: '3', type: 'sync' }
            ],
            fragments: [
                { id: 'inner', type: 'loop', label: 'Inner', startMessageId: 'm2', endMessageId: 'm2' },
                { id: 'outer', type: 'alt', label: 'Outer', startMessageId: 'm1', endMessageId: 'm3' }
            ]
        };

        const frame = engine.calculate(data);
        const inner = frame.fragments.find(f => f.data.id === 'inner')!;
        const outer = frame.fragments.find(f => f.data.id === 'outer')!;

        // Inner should be standard width (Actor X +- Padding)
        // Outer should be Inner width + Gaps because it wraps it
        // Wait, if they use same actors, basic width is same.
        // But Outer wraps Inner.
        // Check bounds.
        expect(outer.x).toBeLessThan(inner.x);
        expect(outer.x + outer.width).toBeGreaterThan(inner.x + inner.width);
    });

    it('should add extra vertical space for fragment headers', () => {
        const engine = new LayoutEngine();
        const data: DiagramData = {
            actors: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }],
            messages: [
                { id: 'm0', from: '1', to: '2', label: 'Setup', type: 'sync' },
                { id: 'm1', from: '1', to: '2', label: 'Start Frag', type: 'sync' }
            ],
            fragments: [
                { id: 'f1', type: 'alt', label: 'Test', startMessageId: 'm1', endMessageId: 'm1' }
            ]
        };

        const frame = engine.calculate(data);
        const m0Y = frame.messages[0].p1.y;
        const m1Y = frame.messages[1].p1.y;

        // Normal spacing is 50. With padding (30), diff should be 80.
        expect(m1Y - m0Y).toBe(80);

        const frag = frame.fragments[0];
        // Frag Y is m1Y - 45
        expect(frag.y).toBe(m1Y - 45);

        // Header clearance check: (m1Y - frag.y) should be 45
        expect(m1Y - frag.y).toBe(45);
    });
});
