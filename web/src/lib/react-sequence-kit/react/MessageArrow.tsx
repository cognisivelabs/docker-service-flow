import React from 'react';
import type { RenderedMessage } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface MessageArrowProps {
    renderedMessage: RenderedMessage;
    isSelected?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onHover?: (ctx: any | null) => void;
    theme: SequenceTheme;
}

/**
 * Message type determines arrow style:
 * - sync: solid line, filled arrowhead
 * - async: solid line, open arrowhead
 * - reply: dashed line, open arrowhead
 * - create: dashed line, filled arrowhead
 * - destroy: solid line, X marker at end
 */
export const MessageArrow: React.FC<MessageArrowProps> = ({ renderedMessage, isSelected, onClick, onHover, theme }) => {
    const { p1, p2, labelPosition, data } = renderedMessage;
    const isSelf = p1.x === p2.x;
    const messageType = data.type || 'sync';

    let pathData = '';
    if (isSelf) {
        const width = 40;
        pathData = `M ${p1.x} ${p1.y} L ${p1.x + width} ${p1.y} L ${p1.x + width} ${p2.y} L ${p2.x} ${p2.y}`;
    } else {
        pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }

    const color = isSelected ? theme.colors.selection : theme.colors.message;
    const strokeWidth = isSelected ? (theme.geometry.messageStrokeWidth + 1) : theme.geometry.messageStrokeWidth;

    // Determine stroke dash based on message type
    const strokeDasharray = (messageType === 'reply' || messageType === 'create')
        ? '6,4'
        : undefined;

    // Determine marker based on message type
    const getMarkerEnd = () => {
        if (messageType === 'destroy') return isSelected ? 'url(#marker-x-selected)' : 'url(#marker-x)';
        if (messageType === 'async' || messageType === 'reply') return isSelected ? 'url(#arrowhead-open-selected)' : 'url(#arrowhead-open)';
        return isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)';
    };

    return (
        <g
            className="message-arrow"
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(e);
            }}
            onMouseEnter={() => onHover?.({ type: 'message', data, x: labelPosition.x, y: labelPosition.y })}
            onMouseLeave={() => onHover?.(null)}
            style={{ cursor: 'pointer' }}
        >
            {/* Invisible hit area for easier clicking */}
            <path d={pathData} stroke="transparent" strokeWidth="15" fill="none" />

            {/* Visible line */}
            <path
                d={pathData}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                fill="none"
                markerEnd={getMarkerEnd()}
            />

            {/* Lost/Found endpoint circle */}
            {messageType === 'lost' && (
                <circle cx={p2.x} cy={p2.y} r={5} fill={color} />
            )}
            {messageType === 'found' && (
                <circle cx={p1.x} cy={p1.y} r={5} fill={color} />
            )}

            {/* Label with background */}
            <g transform={`translate(${labelPosition.x}, ${labelPosition.y})`}>
                <rect
                    x="-50" y="-12" width="100" height="16"
                    fill={isSelected ? theme.colors.selectionBackground : "rgba(255,255,255,0.8)"}
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
