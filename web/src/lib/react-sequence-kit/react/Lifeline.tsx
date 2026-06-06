import React from 'react';
import type { RenderedActor } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface LifelineProps {
    renderedActor: RenderedActor;
    isSelected?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    theme: SequenceTheme;
}

export const Lifeline: React.FC<LifelineProps> = ({ renderedActor, isSelected, onClick, theme }) => {
    const { x, y, height, data } = renderedActor;
    const bottomY = y + height;

    // Heuristic for text width: ~8px per char for typical font, plus padding. 
    // Default min-width 100px.
    const charWidth = 9;
    const padding = 20;
    const estimatedTextWidth = data.name.length * charWidth;
    const boxWidth = Math.max(100, estimatedTextWidth + padding);
    const boxHalfWidth = boxWidth / 2;

    return (
        <g
            className="lifeline"
            onClick={onClick}
            style={{ cursor: 'pointer' }}
        >
            {/* Halo for easier selection */}
            <rect
                x={x - (boxHalfWidth + 5)}
                y={y - 5}
                width={boxWidth + 10}
                height={height + 10}
                fill="transparent"
                stroke={isSelected ? theme.colors.selectionBackground : "none"}
                strokeWidth="6"
            />

            {/* The vertical dashed line */}
            <line
                x1={x}
                y1={y + 30}
                x2={x}
                y2={bottomY}
                stroke={isSelected ? theme.colors.selection : theme.colors.lifeline}
                strokeWidth={isSelected ? "2" : "1"}
                strokeDasharray="5,5"
            />

            {/* The Actor Head (Flexible Box) */}
            <rect
                x={x - boxHalfWidth}
                y={y}
                width={boxWidth}
                height={30}
                fill={isSelected ? theme.colors.selectionBackground : theme.colors.actorBackground}
                stroke={isSelected ? theme.colors.selection : theme.colors.actorBorder}
                strokeWidth={isSelected ? "2" : "1"}
                rx="4"
            />

            {/* The Label */}
            <text
                x={x}
                y={y + 20}
                textAnchor="middle"
                fontSize={theme.typography.fontSize}
                fontFamily={theme.typography.fontFamily}
                fill={theme.colors.actorText}
                style={{ pointerEvents: 'none' }}
            >
                {data.name}
            </text>
        </g>
    );
};
