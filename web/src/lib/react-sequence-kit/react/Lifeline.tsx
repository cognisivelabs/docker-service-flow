import React from 'react';
import type { RenderedActor } from '../engine/engine.types';
import type { SequenceTheme } from './theme';
import type { TooltipContext } from './SequenceDiagram';

interface LifelineProps {
    renderedActor: RenderedActor;
    isSelected?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onHover?: (ctx: TooltipContext | null) => void;
    theme: SequenceTheme;
}

const ACTOR_HEAD_HEIGHT = 30;

// Stereotype icon renderers
const StickFigure: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
    <g>
        <circle cx={x} cy={y - 20} r={8} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={x} y1={y - 12} x2={x} y2={y + 2} stroke={color} strokeWidth="1.5" />
        <line x1={x - 10} y1={y - 6} x2={x + 10} y2={y - 6} stroke={color} strokeWidth="1.5" />
        <line x1={x} y1={y + 2} x2={x - 8} y2={y + 14} stroke={color} strokeWidth="1.5" />
        <line x1={x} y1={y + 2} x2={x + 8} y2={y + 14} stroke={color} strokeWidth="1.5" />
    </g>
);

const CylinderIcon: React.FC<{ x: number; y: number; color: string; fill: string }> = ({ x, y, color, fill }) => (
    <g>
        <path d={`M ${x - 20} ${y - 15} L ${x - 20} ${y + 10} Q ${x - 20} ${y + 18} ${x} ${y + 18} Q ${x + 20} ${y + 18} ${x + 20} ${y + 10} L ${x + 20} ${y - 15}`}
            fill={fill} stroke={color} strokeWidth="1.5" />
        <ellipse cx={x} cy={y - 15} rx={20} ry={7} fill={fill} stroke={color} strokeWidth="1.5" />
    </g>
);

const BoundaryIcon: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
    <g>
        <circle cx={x + 5} cy={y} r={12} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={x - 12} y1={y - 15} x2={x - 12} y2={y + 15} stroke={color} strokeWidth="1.5" />
        <line x1={x - 12} y1={y} x2={x - 7} y2={y} stroke={color} strokeWidth="1.5" />
    </g>
);

const ControlIcon: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
    <g>
        <circle cx={x} cy={y} r={12} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={x} y1={y - 12} x2={x + 6} y2={y - 18} stroke={color} strokeWidth="1.5" />
        <line x1={x} y1={y - 12} x2={x - 4} y2={y - 19} stroke={color} strokeWidth="1.5" />
    </g>
);

export const Lifeline: React.FC<LifelineProps> = ({ renderedActor, isSelected, onClick, onHover, theme }) => {
    const { x, y, height, data } = renderedActor;
    const bottomY = y + height;
    const stereotype = data.stereotype;

    const charWidth = 9;
    const padding = 20;
    const estimatedTextWidth = data.name.length * charWidth;
    const boxWidth = Math.max(100, estimatedTextWidth + padding);
    const boxHalfWidth = boxWidth / 2;

    const color = isSelected ? theme.colors.selection : theme.colors.actorBorder;
    const bgColor = isSelected ? theme.colors.selectionBackground : theme.colors.actorBackground;

    // Determine if we render an icon above the name box
    const hasIcon = stereotype && stereotype !== 'actor' || stereotype === 'actor';
    const iconHeight = hasIcon ? 40 : 0;
    const lifelineStartY = y + ACTOR_HEAD_HEIGHT + iconHeight;

    return (
        <g
            className="lifeline"
            onClick={onClick}
            onMouseEnter={() => onHover?.({ type: 'actor', data, x, y, width: boxWidth, height })}
            onMouseLeave={() => onHover?.(null)}
            style={{ cursor: 'pointer' }}
        >
            {/* Halo for selection */}
            <rect
                x={x - (boxHalfWidth + 5)}
                y={y - (iconHeight + 5)}
                width={boxWidth + 10}
                height={height + iconHeight + 10}
                fill="transparent"
                stroke={isSelected ? theme.colors.selectionBackground : "none"}
                strokeWidth="6"
            />

            {/* Vertical dashed lifeline */}
            <line
                x1={x}
                y1={lifelineStartY}
                x2={x}
                y2={bottomY}
                stroke={isSelected ? theme.colors.selection : theme.colors.lifeline}
                strokeWidth={isSelected ? "2" : "1"}
                strokeDasharray="5,5"
            />

            {/* Stereotype icon (above name box) */}
            {stereotype === 'actor' && (
                <StickFigure x={x} y={y - 10} color={color} />
            )}
            {stereotype === 'database' && (
                <CylinderIcon x={x} y={y - 12} color={color} fill={bgColor} />
            )}
            {stereotype === 'boundary' && (
                <BoundaryIcon x={x} y={y - 12} color={color} />
            )}
            {stereotype === 'control' && (
                <ControlIcon x={x} y={y - 12} color={color} />
            )}

            {/* Actor name box */}
            <rect
                x={x - boxHalfWidth}
                y={y + iconHeight}
                width={boxWidth}
                height={ACTOR_HEAD_HEIGHT}
                fill={bgColor}
                stroke={color}
                strokeWidth={isSelected ? "2" : "1"}
                rx="4"
            />

            {/* Label */}
            <text
                x={x}
                y={y + iconHeight + 20}
                textAnchor="middle"
                fontSize={theme.typography.fontSize}
                fontFamily={theme.typography.fontFamily}
                fill={theme.colors.actorText}
                style={{ pointerEvents: 'none' }}
            >
                {data.name}
            </text>

            {/* Stereotype label (small, below icon) */}
            {stereotype && (
                <text
                    x={x}
                    y={y + iconHeight - 3}
                    textAnchor="middle"
                    fontSize={theme.typography.fontSize - 3}
                    fontFamily={theme.typography.fontFamily}
                    fill={theme.colors.actorText}
                    style={{ pointerEvents: 'none', fontStyle: 'italic' }}
                >
                    {`«${stereotype}»`}
                </text>
            )}
        </g>
    );
};
