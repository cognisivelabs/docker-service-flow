import type { DiagramData, Actor, Message } from './model.types';

export class DiagramController {
    private model: DiagramData;
    private listeners: (() => void)[] = [];

    constructor(initialModel?: DiagramData) {
        this.model = initialModel || {
            actors: [],
            messages: [],
            fragments: []
        };
    }

    public getModel(): DiagramData {
        return this.model;
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(listener => listener());
    }

    // --- Actors ---

    public addActor(actor: Actor) {
        // Prevent duplicate IDs
        if (this.model.actors.some(a => a.id === actor.id)) {
            console.warn(`Actor with id ${actor.id} already exists.`);
            return;
        }
        this.model = {
            ...this.model,
            actors: [...this.model.actors, actor]
        };
        this.notify();
    }

    public deleteActor(id: string) {
        this.model = {
            ...this.model,
            actors: this.model.actors.filter(a => a.id !== id),
            // Cascade delete messages involving this actor
            messages: this.model.messages.filter(m => m.from !== id && m.to !== id)
        };
        // TODO: Handle fragments that might reference deleted messages?
        this.notify();
    }

    public reorderActors(actorIds: string[]) {
        // Sort existing actors based on the provided ID array order
        const orderMap = new Map(actorIds.map((id, index) => [id, index]));

        const sortedActors = [...this.model.actors].sort((a, b) => {
            const indexA = orderMap.get(a.id) ?? Number.MAX_VALUE;
            const indexB = orderMap.get(b.id) ?? Number.MAX_VALUE;
            return indexA - indexB;
        });

        this.model = {
            ...this.model,
            actors: sortedActors
        };
        this.notify();
    }

    // --- Messages ---

    public addMessage(message: Message) {
        if (this.model.messages.some(m => m.id === message.id)) {
            console.warn(`Message with id ${message.id} already exists.`);
            return;
        }
        this.model = {
            ...this.model,
            messages: [...this.model.messages, message]
        };
        this.notify();
    }

    public deleteMessage(id: string) {
        this.model = {
            ...this.model,
            messages: this.model.messages.filter(m => m.id !== id)
        };
        this.notify();
    }

    public moveMessage(id: string, newIndex: number) {
        const currentIndex = this.model.messages.findIndex(m => m.id === id);
        if (currentIndex === -1) return;

        const newMessages = [...this.model.messages];
        const [movedMessage] = newMessages.splice(currentIndex, 1);

        // Clamp index
        const targetIndex = Math.max(0, Math.min(newIndex, newMessages.length));
        newMessages.splice(targetIndex, 0, movedMessage);

        this.model = {
            ...this.model,
            messages: newMessages
        };
        this.notify();
    }
}
