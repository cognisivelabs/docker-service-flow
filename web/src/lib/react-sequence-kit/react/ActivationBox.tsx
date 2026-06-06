import React from 'react';
import type { RenderedActivation } from '../engine/engine.types';
import { type SequenceTheme } from './theme';

interface ActivationBoxProps {
    renderedActivation: RenderedActivation;
    theme: SequenceTheme;
}

export const ActivationBox: React.FC<ActivationBoxProps> = ({ renderedActivation, theme }) => {
    const { x, y, width, height } = renderedActivation;

    return (
        <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={theme.colors.activation}
            stroke={theme.colors.activationBorder}
            strokeWidth="1"
        />
    );
};
