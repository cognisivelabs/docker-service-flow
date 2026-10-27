import React from 'react';
import type { RenderedNote } from '../engine/engine.types';
import type { SequenceTheme } from './theme';

interface NoteRendererProps {
    renderedNote: RenderedNote;
    theme: SequenceTheme;
}

const DOG_EAR_SIZE = 8;

export const NoteRenderer: React.FC<NoteRendererProps> = ({ renderedNote, theme }) => {
    const { x, y, width, height, data } = renderedNote;

    // Dog-ear polygon (top-right corner fold)
    const bodyPath = `
        M ${x} ${y}
        L ${x + width - DOG_EAR_SIZE} ${y}
        L ${x + width} ${y + DOG_EAR_SIZE}
        L ${x + width} ${y + height}
        L ${x} ${y + height}
        Z
    `;

    const earPath = `
        M ${x + width - DOG_EAR_SIZE} ${y}
        L ${x + width - DOG_EAR_SIZE} ${y + DOG_EAR_SIZE}
        L ${x + width} ${y + DOG_EAR_SIZE}
    `;

    return (
        <g className="note">
            <path
                d={bodyPath}
                fill={theme.colors.noteBackground}
                stroke={theme.colors.noteBorder}
                strokeWidth={theme.geometry.strokeWidth}
            />
            <path
                d={earPath}
                fill="none"
                stroke={theme.colors.noteBorder}
                strokeWidth={theme.geometry.strokeWidth}
            />
            <text
                x={x + 6}
                y={y + height / 2 + 4}
                fontSize={theme.typography.fontSize - 2}
                fontFamily={theme.typography.fontFamily}
                fill={theme.colors.noteText}
            >
                {data.text}
            </text>
        </g>
    );
};
