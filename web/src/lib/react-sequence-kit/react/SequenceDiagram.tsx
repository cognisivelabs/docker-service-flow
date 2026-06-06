import React, { useMemo } from 'react';
import type { Actor, Message, Fragment } from '../engine/model.types';
import { LayoutEngine } from '../engine/LayoutEngine';
import type { LayoutConfig } from '../engine/engine.types';
import { Lifeline } from './Lifeline';
import { MessageArrow } from './MessageArrow';
import { FragmentRenderer } from './FragmentRenderer';
import { DiagramViewport } from './DiagramViewport';
import { ActivationBox } from './ActivationBox';
import { type SequenceTheme, DEFAULT_THEME } from './theme';

export type DiagramElementId = string;
export type DiagramElementType = 'actor' | 'message' | 'fragment';

export interface SelectionEvent {
    id: DiagramElementId;
    type: DiagramElementType;
}

export interface SequenceDiagramProps {
    actors: Actor[];
    messages: Message[];
    fragments?: Fragment[];
    config?: Partial<LayoutConfig>;
    className?: string;
    style?: React.CSSProperties;
    // Interaction
    selectedId?: string | null;
    onSelect?: (event: SelectionEvent | null) => void;
    theme?: SequenceTheme;
}

export const SequenceDiagram: React.FC<SequenceDiagramProps> = ({
    actors,
    messages,
    fragments,
    config = {},
    className,
    style,
    selectedId,
    onSelect,
    theme
}) => {
    const activeTheme = useMemo(() => {
        return theme || DEFAULT_THEME;
    }, [theme]);

    const layout = useMemo(() => {
        const engine = new LayoutEngine(config);
        return engine.calculate({ actors, messages, fragments });
    }, [actors, messages, fragments, config]);

    return (
        <div
            className={`sequence-diagram-container ${className || ''}`}
            style={{
                width: '100%',
                height: '100%',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                backgroundColor: '#fff',
                ...style
            }}
            onClick={() => onSelect?.(null)} // Deselect on background click
        >
            <DiagramViewport width={layout.width} height={layout.height}>
                <svg
                    width={layout.width}
                    height={layout.height}
                    style={{ display: 'block' }}
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill={activeTheme.colors.message} />
                        </marker>
                        {/* Selected Blue Arrowhead */}
                        <marker
                            id="arrowhead-selected"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill={activeTheme.colors.selection} />
                        </marker>
                    </defs>

                    {/* Render Actors/Lifelines */}
                    {layout.actors.map((actor) => (
                        <Lifeline
                            key={actor.data.id}
                            renderedActor={actor}
                            isSelected={selectedId === actor.data.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect?.({ id: actor.data.id, type: 'actor' });
                            }}
                            theme={activeTheme}
                        />
                    ))}

                    {/* Render Activations */}
                    {layout.activations.map((act, i) => (
                        <ActivationBox key={i} renderedActivation={act} theme={activeTheme} />
                    ))}

                    {/* Render Fragments (Now on top of Activations as requested) */}
                    {layout.fragments?.map((frag) => (
                        <FragmentRenderer key={frag.data.id} renderedFragment={frag} theme={activeTheme} />
                    ))}

                    {/* Render Messages */}
                    {layout.messages.map((msg) => (
                        <MessageArrow
                            key={msg.data.id}
                            renderedMessage={msg}
                            isSelected={selectedId === msg.data.id}
                            onClick={(e) => {
                                e.stopPropagation(); // Already handled in component but good safety
                                onSelect?.({ id: msg.data.id, type: 'message' });
                            }}
                            theme={activeTheme}
                        />
                    ))}
                </svg>
            </DiagramViewport>
        </div>
    );
};
