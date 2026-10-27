import React, { useMemo } from 'react';
import type { Actor, Message, Fragment, Note } from '../engine/model.types';
import { LayoutEngine } from '../engine/LayoutEngine';
import type { LayoutConfig } from '../engine/engine.types';
import { Lifeline } from './Lifeline';
import { MessageArrow } from './MessageArrow';
import { FragmentRenderer } from './FragmentRenderer';
import { NoteRenderer } from './NoteRenderer';
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
    notes?: Note[];
    config?: Partial<LayoutConfig>;
    className?: string;
    style?: React.CSSProperties;
    // Interaction
    selectedId?: string | null;
    onSelect?: (event: SelectionEvent | null) => void;

    // Rich Events
    onActorClick?: (actor: Actor) => void;
    onMessageClick?: (message: Message) => void;
    onFragmentClick?: (fragment: Fragment) => void;

    // Tooltips
    renderTooltip?: (context: TooltipContext) => React.ReactNode;

    theme?: SequenceTheme;
}

export interface TooltipContext {
    type: 'actor' | 'message' | 'fragment';
    data: Actor | Message | Fragment;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export const SequenceDiagram: React.FC<SequenceDiagramProps> = ({
    actors,
    messages,
    fragments,
    notes,
    config = {},
    className,
    style,
    selectedId,
    onSelect,
    onActorClick,
    onMessageClick,
    onFragmentClick,
    renderTooltip,
    theme
}) => {
    const activeTheme = useMemo(() => {
        return theme || DEFAULT_THEME;
    }, [theme]);


    // Tooltip State
    const [hoveredCtx, setHoveredCtx] = React.useState<TooltipContext | null>(null);

    const layout = useMemo(() => {
        const engine = new LayoutEngine(config);
        return engine.calculate({ actors, messages, fragments, notes });
    }, [actors, messages, fragments, notes, config]);

    // Handler to set/clear hover
    const handleHover = (ctx: TooltipContext | null) => {
        if (!renderTooltip) return; // Optimization
        setHoveredCtx(ctx);
    };

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
                        {/* Filled arrowhead (sync) */}
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill={activeTheme.colors.message} />
                        </marker>
                        <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill={activeTheme.colors.selection} />
                        </marker>

                        {/* Open arrowhead (async, reply) */}
                        <marker id="arrowhead-open" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polyline points="0 0, 10 3.5, 0 7" fill="none" stroke={activeTheme.colors.message} strokeWidth="1.5" />
                        </marker>
                        <marker id="arrowhead-open-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polyline points="0 0, 10 3.5, 0 7" fill="none" stroke={activeTheme.colors.selection} strokeWidth="1.5" />
                        </marker>

                        {/* X marker (destroy) */}
                        <marker id="marker-x" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                            <line x1="2" y1="2" x2="10" y2="10" stroke={activeTheme.colors.message} strokeWidth="2" />
                            <line x1="10" y1="2" x2="2" y2="10" stroke={activeTheme.colors.message} strokeWidth="2" />
                        </marker>
                        <marker id="marker-x-selected" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
                            <line x1="2" y1="2" x2="10" y2="10" stroke={activeTheme.colors.selection} strokeWidth="2" />
                            <line x1="10" y1="2" x2="2" y2="10" stroke={activeTheme.colors.selection} strokeWidth="2" />
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
                                onActorClick?.(actor.data);
                            }}
                            onHover={handleHover}
                            theme={activeTheme}
                        />
                    ))}

                    {/* Render Activations */}
                    {layout.activations.map((act, i) => (
                        <ActivationBox key={i} renderedActivation={act} theme={activeTheme} />
                    ))}

                    {/* Render Fragments (Now on top of Activations as requested) */}
                    {layout.fragments?.map((frag) => (
                        <FragmentRenderer
                            key={frag.data.id}
                            renderedFragment={frag}
                            theme={activeTheme}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect?.({ id: frag.data.id, type: 'fragment' });
                                onFragmentClick?.(frag.data);
                            }}
                            onHover={(ctx) => handleHover(ctx ? { ...ctx, type: 'fragment', data: frag.data } : null)}
                        />
                    ))}

                    {/* Render Notes */}
                    {layout.notes?.map((note) => (
                        <NoteRenderer
                            key={note.data.id}
                            renderedNote={note}
                            theme={activeTheme}
                        />
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
                                onMessageClick?.(msg.data);
                            }}
                            onHover={handleHover}
                            theme={activeTheme}
                        />
                    ))}
                </svg>
            </DiagramViewport>

            {/* Tooltip Overlay */}
            {hoveredCtx && renderTooltip && (
                <div
                    style={{
                        position: 'absolute',
                        left: hoveredCtx.x + (hoveredCtx.width ? hoveredCtx.width / 2 : 0),
                        top: hoveredCtx.y,
                        transform: 'translate(-50%, -100%)', // Center above element
                        pointerEvents: 'none', // Don't block clicks
                        zIndex: 1000 // On top of everything
                    }}
                >
                    {renderTooltip(hoveredCtx)}
                </div>
            )}
        </div>
    );
};
