import React from 'react';
import type { RenderedMessage } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface MessageArrowProps {
    renderedMessage: RenderedMessage;
    isSelected?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    theme: SequenceTheme;
}

export const MessageArrow: React.FC<MessageArrowProps> = ({ renderedMessage, isSelected, onClick, theme }) => {
    const { p1, p2, labelPosition, data } = renderedMessage;
    const isSelf = p1.x === p2.x;

    let pathData = '';

    if (isSelf) {
        // Loopback path
        const width = 40;
        pathData = `M ${p1.x} ${p1.y} L ${p1.x + width} ${p1.y} L ${p1.x + width} ${p2.y} L ${p2.x} ${p2.y}`;
    } else {
        // Normal straight line
        pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }



    const color = isSelected ? theme.colors.selection : theme.colors.message;
    const strokeWidth = isSelected ? (theme.geometry.messageStrokeWidth + 1) : theme.geometry.messageStrokeWidth;

    return (
        <g
            className="message-arrow"
            onClick={(e) => {
                e.stopPropagation(); // specific message, not background
                onClick?.(e);
            }}
            style={{ cursor: 'pointer' }}
        >
            {/* The invisible hit area for easier clicking */}
            <path d={pathData} stroke="transparent" strokeWidth="15" fill="none" />

            {/* The visible line */}
            <path
                d={pathData}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
                markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
            />

            {/* The Label with background */}
            <g transform={`translate(${labelPosition.x}, ${labelPosition.y})`}>
                <rect
                    x="-50" y="-12" width="100" height="16"
                    fill={isSelected ? theme.colors.selectionBackground : "rgba(255,255,255,0.8)"} // TODO: theme.colors.labelBackground?
                    style={{ opacity: 0.9 }}
                />
                <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    fontSize={theme.typography.fontSize - 2}
                    fontFamily={theme.typography.fontFamily}
                    fontWeight={isSelected ? "bold" : "normal"}
                    fill={isSelected ? theme.colors.selection : theme.colors.messageText}
                >
                    {data.label}
                </text>
            </g>
        </g>
    );
};
