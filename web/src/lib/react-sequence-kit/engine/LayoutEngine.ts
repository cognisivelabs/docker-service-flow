import type { DiagramData } from './model.types';
import {
    type LayoutConfig,
    DEFAULT_CONFIG,
    type DiagramFrame,
    type RenderedActor,
    type RenderedMessage,
    type RenderedFragment,
    type RenderedActivation
} from './engine.types';

export class LayoutEngine {
    private config: LayoutConfig;

    constructor(config: Partial<LayoutConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    calculate(data: DiagramData): DiagramFrame {
        // 1. Calculate X positions for Actors
        const actorsMap = new Map<string, number>(); // ID -> X
        const renderedActors: RenderedActor[] = [];

        let currentX = this.config.actorMargin;
        const actorIdToIndex = new Map<string, number>();

        data.actors.forEach((actor, index) => {
            renderedActors.push({
                data: actor,
                x: currentX,
                y: this.config.topMargin,
                height: 0,
            });
            actorsMap.set(actor.id, currentX);
            actorIdToIndex.set(actor.id, index);
            currentX += this.config.actorSpacing;
        });

        const totalWidth = currentX - this.config.actorSpacing + this.config.actorMargin;

        // 2. Calculate Y positions for Messages AND Track Activations
        const renderedMessages: RenderedMessage[] = [];
        const messageIdToY = new Map<string, number>();
        let currentY = this.config.topMargin + this.config.messageHeight;

        // Activation Tracking
        const activations: RenderedActivation[] = [];
        const activeStack = new Map<string, RenderedActivation[]>(); // ActorID -> Stack of active activations

        data.messages.forEach(msg => {
            const fromX = actorsMap.get(msg.from);
            const toX = actorsMap.get(msg.to);

            // Check if this message starts any fragments
            const startingFragments = data.fragments ? data.fragments.filter(f => f.startMessageId === msg.id) : [];
            if (startingFragments.length > 0) {
                // Add extra spacing for headers (e.g. 30px per fragment level to be safe, or just fixed block)
                // For now, fixed padding ensures at least one header fits clearly.
                // We'll add 30px padding.
                currentY += 30;
            }

            messageIdToY.set(msg.id, currentY);

            if (fromX === undefined || toX === undefined) return;

            // Activation Logic
            if (msg.type === 'sync') {
                const stack = activeStack.get(msg.to) || [];
                const stackDepth = stack.length;

                const ACTIVATION_WIDTH = 10;
                // Offset nested activations to the right (half width overlap)
                const stackOffset = stackDepth * (ACTIVATION_WIDTH / 2);

                const newActivation: RenderedActivation = {
                    actorId: msg.to,
                    startMessageId: msg.id,
                    x: toX - (ACTIVATION_WIDTH / 2) + stackOffset,
                    y: currentY,
                    width: ACTIVATION_WIDTH,
                    height: 0 // placeholder
                };

                stack.push(newActivation);
                activeStack.set(msg.to, stack);
                activations.push(newActivation);
            }
            else if (msg.type === 'reply') {
                const stack = activeStack.get(msg.from);
                if (stack && stack.length > 0) {
                    const activation = stack.pop();
                    if (activation) {
                        activation.endMessageId = msg.id;
                        activation.height = currentY - activation.y;
                    }
                }
            }

            const isSelf = msg.from === msg.to;
            if (isSelf) {
                renderedMessages.push({
                    data: msg,
                    p1: { x: fromX, y: currentY },
                    p2: { x: fromX, y: currentY + 20 },
                    labelPosition: { x: fromX + this.config.selfMessageWidth + 5, y: currentY + 10 },
                });
                currentY += this.config.messageHeight;
            } else {
                renderedMessages.push({
                    data: msg,
                    p1: { x: fromX, y: currentY },
                    p2: { x: toX, y: currentY },
                    labelPosition: { x: (fromX + toX) / 2, y: currentY - 5 },
                });
                currentY += this.config.messageHeight;
            }
        });

        // Close any remaining open activations (reach bottom of diagram)
        activeStack.forEach((stack) => {
            stack.forEach(act => {
                if (!act.endMessageId) {
                    act.height = currentY - act.y + 20; // Extend to bottom
                }
            });
        });

        // 3. Calculate Fragments
        const renderedFragments: RenderedFragment[] = [];
        if (data.fragments) {
            // Pass 1: Initial Bounds Calculation
            const tempFragments: (RenderedFragment & { startIndex: number, endIndex: number })[] = [];

            data.fragments.forEach(frag => {
                const startY = messageIdToY.get(frag.startMessageId);
                const endY = messageIdToY.get(frag.endMessageId);

                if (startY !== undefined && endY !== undefined) {
                    let minX = Infinity;
                    let maxX = -Infinity;

                    const startMsgIndex = data.messages.findIndex(m => m.id === frag.startMessageId);
                    const endMsgIndex = data.messages.findIndex(m => m.id === frag.endMessageId);

                    if (startMsgIndex !== -1 && endMsgIndex !== -1) {
                        for (let i = startMsgIndex; i <= endMsgIndex; i++) {
                            const m = data.messages[i];
                            const ax1 = actorsMap.get(m.from) || 0;
                            const ax2 = actorsMap.get(m.to) || 0;
                            minX = Math.min(minX, ax1, ax2);
                            maxX = Math.max(maxX, ax1, ax2);
                        }

                        const PADDING = 20;
                        tempFragments.push({
                            data: frag,
                            x: minX - PADDING,
                            y: startY - 45, // Increased header space from 25 to 45
                            width: (maxX - minX) + (PADDING * 2),
                            height: (endY - startY) + 70, // Compensate height (50 -> 70)
                            startIndex: startMsgIndex,
                            endIndex: endMsgIndex
                        });
                    }
                }
            });

            // Pass 2: Nested Expansion
            // Sort by size (message count) ascending so we process inner fragments first
            tempFragments.sort((a, b) => (a.endIndex - a.startIndex) - (b.endIndex - b.startIndex));

            for (let i = 0; i < tempFragments.length; i++) {
                const inner = tempFragments[i];
                for (let j = i + 1; j < tempFragments.length; j++) {
                    const outer = tempFragments[j];

                    // Check if Outer truly wraps Inner
                    if (outer.startIndex <= inner.startIndex && outer.endIndex >= inner.endIndex) {
                        // Ensure Outer is visually larger than Inner 
                        // (even if actors are same, we want hierarchy)
                        const NESTING_GAP = 15;

                        const innerLeft = inner.x;
                        const innerRight = inner.x + inner.width;

                        // Outer Left must be at most Inner Left - GAP
                        const targetLeft = Math.min(outer.x, innerLeft - NESTING_GAP);
                        // Outer Right must be at least Inner Right + GAP
                        const targetRight = Math.max(outer.x + outer.width, innerRight + NESTING_GAP);

                        outer.x = targetLeft;
                        outer.width = targetRight - targetLeft;
                    }
                }
            }

            // Push final results
            renderedFragments.push(...tempFragments.map(({ startIndex, endIndex, ...rest }) => rest));
        }

        const totalHeight = currentY + this.config.messageHeight;

        // 4. Update Actor Heights
        renderedActors.forEach(actor => {
            actor.height = totalHeight - actor.y;
        });

        return {
            width: totalWidth,
            height: totalHeight,
            actors: renderedActors,
            messages: renderedMessages,
            fragments: renderedFragments,
            activations: activations
        };
    }
}
