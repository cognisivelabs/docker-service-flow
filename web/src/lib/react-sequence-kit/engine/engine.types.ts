import type { Actor, Message, Fragment } from './model.types';

export interface Point {
    x: number;
    y: number;
}

export interface RenderedActor {
    data: Actor;
    x: number; // Center X of the lifeline
    y: number; // Start Y (top of the head)
    height: number; // Total height of lifeline
}

export interface RenderedMessage {
    data: Message;
    p1: Point; // Start (tail)
    p2: Point; // End (head)
    labelPosition: Point;
}

export interface RenderedFragment {
    data: Fragment;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RenderedActivation {
    actorId: string;
    startMessageId: string; // The message that started this - simplistic
    endMessageId?: string; // The message that ended this
    x: number;
    y: number;
    width: number;
    height: number; // Will be calculated after all messages
}

export interface LayoutConfig {
    actorSpacing: number; // Distance between actor centers
    actorMargin: number;  // Left/Right margin
    messageHeight: number; // Vertical space per message
    selfMessageWidth: number; // Width of loopback
    topMargin: number; // Top padding for actor heads
}

export const DEFAULT_CONFIG: LayoutConfig = {
    actorSpacing: 200,
    actorMargin: 100,
    messageHeight: 50,
    selfMessageWidth: 40,
    topMargin: 40,
};

export interface DiagramFrame {
    width: number;
    height: number;
    actors: RenderedActor[];
    messages: RenderedMessage[];
    fragments: RenderedFragment[];
    activations: RenderedActivation[];
}
