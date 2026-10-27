import React from 'react';
import type { RenderedFragment } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface FragmentRendererProps {
    renderedFragment: RenderedFragment;
    theme: SequenceTheme;
    onClick?: (e: React.MouseEvent) => void;
    onHover?: (ctx: any | null) => void;
}

export const FragmentRenderer: React.FC<FragmentRendererProps> = ({ renderedFragment, theme, onClick, onHover }) => {
    const { x, y, width, height, data } = renderedFragment;

    // Type-specific styling
    const getTypeStyle = () => {
        switch (data.type) {
            case 'break':
                return { borderColor: '#ef4444', borderWidth: 2.5, labelColor: '#ef4444' };
            case 'critical':
                return { borderColor: '#f59e0b', borderWidth: 2.5, labelColor: '#f59e0b' };
            default:
                return { borderColor: theme.colors.fragmentBorder, borderWidth: 1.5, labelColor: theme.colors.fragmentText };
        }
    };

    const typeStyle = getTypeStyle();
    const label = data.type;
    const conditionText = data.type === 'loop' ? `[${data.label}]` : `[${data.label}]`;

    return (
        <g
            className="fragment-box"
            transform={`translate(${x}, ${y})`}
            onClick={onClick}
            onMouseEnter={() => onHover?.({ type: 'fragment', data, x, y, width, height })}
            onMouseLeave={() => onHover?.(null)}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {/* Background/Border */}
            <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill={theme.colors.fragmentBackground}
                stroke={typeStyle.borderColor}
                strokeWidth={typeStyle.borderWidth}
                rx="2"
            />

            {/* Double border for critical */}
            {data.type === 'critical' && (
                <rect
                    x="3"
                    y="3"
                    width={width - 6}
                    height={height - 6}
                    fill="none"
                    stroke={typeStyle.borderColor}
                    strokeWidth="1"
                    rx="1"
                    opacity={0.5}
                />
            )}

            {/* Label Tab (top-left corner pentagon) */}
            <path
                d={`M 0 0 L 40 0 L 50 15 L 0 15 Z`}
                fill={theme.colors.background || '#fff'}
                stroke={typeStyle.borderColor}
                strokeWidth={typeStyle.borderWidth}
            />

            {/* Label Text inside Tab */}
            <text
                x="5"
                y="11"
                fontSize="10"
                fontWeight="bold"
                fill={typeStyle.labelColor}
                fontFamily={theme.typography.fontFamily}
            >
                {label}
            </text>

            {/* Condition Text */}
            <text
                x="60"
                y="12"
                fontSize="11"
                fontStyle={data.type === 'loop' ? 'italic' : 'normal'}
                fill={theme.colors.fragmentText}
                fontFamily={theme.typography.fontFamily}
            >
                {conditionText}
            </text>

            {/* Operand dividers for alt/par fragments */}
            {data.operands && data.operands.length > 0 && data.operands.map((operand, i) => {
                // Position dividers evenly within the fragment for now
                // A proper implementation would use messageIdToY, but that requires layout engine changes
                const dividerY = (height / (data.operands!.length + 1)) * (i + 1);
                return (
                    <g key={i}>
                        <line
                            x1={0}
                            y1={dividerY}
                            x2={width}
                            y2={dividerY}
                            stroke={typeStyle.borderColor}
                            strokeWidth="1"
                            strokeDasharray="8,4"
                        />
                        <text
                            x="10"
                            y={dividerY + 14}
                            fontSize="10"
                            fill={theme.colors.fragmentText}
                            fontFamily={theme.typography.fontFamily}
                        >
                            [{operand.condition}]
                        </text>
                    </g>
                );
            })}
        </g>
    );
};
