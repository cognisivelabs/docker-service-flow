export type ActorId = string;

export interface Actor {
    id: ActorId;
    name: string;
    order?: number; // Optional manual ordering
    stereotype?: 'actor' | 'database' | 'boundary' | 'control'; // For potential future icons
}

export type MessageType = 'sync' | 'async' | 'reply' | 'create' | 'destroy' | 'lost' | 'found';

export interface Message {
    id: string;
    from: ActorId;
    to: ActorId;
    label: string;
    type: MessageType;
    order?: number;
}

export interface Note {
    id: string;
    text: string;
    attachTo: ActorId;
    atMessageId: string;
    side: 'left' | 'right';
}

export type FragmentType = 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical';

export interface FragmentOperand {
    condition: string;
    atMessageId: string;
}

export interface Fragment {
    id: string;
    type: FragmentType;
    label: string;
    startMessageId: string;
    endMessageId: string;
    operands?: FragmentOperand[];
}

export interface DiagramData {
    actors: Actor[];
    messages: Message[];
    fragments?: Fragment[];
    notes?: Note[];
}
