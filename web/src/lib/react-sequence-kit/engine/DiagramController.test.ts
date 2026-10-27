import { describe, it, expect, vi } from 'vitest';
import { DiagramController } from './DiagramController';
import type { DiagramData } from './model.types';

describe('DiagramController', () => {
    it('should initialize with empty model if none provided', () => {
        const controller = new DiagramController();
        expect(controller.getModel()).toEqual({
            actors: [],
            messages: [],
            fragments: []
        });
    });

    it('should add an actor and notify listeners', () => {
        const controller = new DiagramController();
        const listener = vi.fn();
        controller.subscribe(listener);

        controller.addActor({ id: 'a1', name: 'Alice' });

        expect(controller.getModel().actors).toHaveLength(1);
        expect(controller.getModel().actors[0].id).toBe('a1');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not add duplicate actor IDs', () => {
        const controller = new DiagramController();
        controller.addActor({ id: 'a1', name: 'Alice' });
        controller.addActor({ id: 'a1', name: 'Alice Duplicate' });

        expect(controller.getModel().actors).toHaveLength(1);
        expect(controller.getModel().actors[0].name).toBe('Alice');
    });

    it('should delete an actor and cascade delete messages', () => {
        const initialData: DiagramData = {
            actors: [{ id: 'a1', name: 'Alice' }, { id: 'a2', name: 'Bob' }],
            messages: [{ id: 'm1', from: 'a1', to: 'a2', label: 'hi', type: 'sync' }],
            fragments: []
        };
        const controller = new DiagramController(initialData);

        controller.deleteActor('a1');

        expect(controller.getModel().actors).toHaveLength(1);
        expect(controller.getModel().actors[0].id).toBe('a2');
        expect(controller.getModel().messages).toHaveLength(0); // Cascaded
    });

    it('should reorder actors', () => {
        const initialData: DiagramData = {
            actors: [{ id: 'a1', name: 'Alice' }, { id: 'a2', name: 'Bob' }, { id: 'a3', name: 'Charlie' }],
            messages: [],
            fragments: []
        };
        const controller = new DiagramController(initialData);

        controller.reorderActors(['a3', 'a1', 'a2']);

        const ids = controller.getModel().actors.map(a => a.id);
        expect(ids).toEqual(['a3', 'a1', 'a2']);
    });

    it('should move a message', () => {
        const initialData: DiagramData = {
            actors: [],
            messages: [
                { id: 'm1', from: 'a', to: 'b', label: '1', type: 'sync' },
                { id: 'm2', from: 'a', to: 'b', label: '2', type: 'sync' },
                { id: 'm3', from: 'a', to: 'b', label: '3', type: 'sync' }
            ],
            fragments: []
        };
        const controller = new DiagramController(initialData);

        // Move m1 to the end (index 2)
        controller.moveMessage('m1', 2);

        const ids = controller.getModel().messages.map(m => m.id);
        expect(ids).toEqual(['m2', 'm3', 'm1']);
    });
});
