import React from 'react';
import type { RenderedFragment } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface FragmentRendererProps {
    renderedFragment: RenderedFragment;
    theme: SequenceTheme;
}

export const FragmentRenderer: React.FC<FragmentRendererProps> = ({ renderedFragment, theme }) => {
    const { x, y, width, height, data } = renderedFragment;

    // Color/Label logic based on type
    const getFragmentLabel = () => {
        switch (data.type) {
            case 'alt': return 'alt';
            case 'opt': return 'opt';
            case 'loop': return 'loop';
            case 'par': return 'par';
            default: return data.type;
        }
    };

    const label = getFragmentLabel();

    return (
        <g className="fragment-box" transform={`translate(${x}, ${y})`}>
            {/* Background/Border of the fragment */}
            <rect
                x="0"
                y="0"
                width={width}
                height={height}
                fill={theme.colors.fragmentBackground}
                stroke={theme.colors.fragmentBorder}
                strokeWidth="1.5"
                rx="2"
            />

            {/* The Label Tab (top-left corner) */}
            <path
                d={`M 0 0 L 40 0 L 50 15 L 0 15 Z`}
                fill={theme.colors.background}
                stroke={theme.colors.fragmentBorder}
                strokeWidth="1.5"
            />

            {/* Label Text inside Tab */}
            <text
                x="5"
                y="11"
                fontSize="10"
                fontWeight="bold"
                fill={theme.colors.fragmentText}
                fontFamily={theme.typography.fontFamily}
            >
                {label}
            </text>

            {/* Description Text (The logic condition) */}
            <text
                x="60"
                y="12"
                fontSize="11"
                fill={theme.colors.fragmentText}
                fontFamily={theme.typography.fontFamily}
            >
                [{data.label}]
            </text>
        </g>
    );
};
