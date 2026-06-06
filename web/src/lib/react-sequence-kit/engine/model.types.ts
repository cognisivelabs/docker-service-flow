export type ActorId = string;

export interface Actor {
    id: ActorId;
    name: string;
    order?: number; // Optional manual ordering
    stereotype?: 'actor' | 'database' | 'boundary' | 'control'; // For potential future icons
}

export type MessageType = 'sync' | 'async' | 'reply' | 'create' | 'destroy';

export interface Message {
    id: string;
    from: ActorId;
    to: ActorId;
    label: string;
    type: MessageType;
    order?: number; // Usually implied by array index, but good for stability
}

export type FragmentType = 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical';

export interface Fragment {
    id: string;
    type: FragmentType;
    label: string; // e.g., "if user is valid"
    startMessageId: string; // The ID of the message where this block starts (inclusive)
    endMessageId: string;   // The ID of the message where this block ends (inclusive)
}

export interface DiagramData {
    actors: Actor[];
    messages: Message[];
    fragments?: Fragment[];
}
