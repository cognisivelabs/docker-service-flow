export interface SequenceTheme {
    colors: {
        background: string;
        actorBorder: string;
        actorBackground: string;
        actorText: string;
        lifeline: string;
        message: string;
        messageText: string;
        activation: string;
        activationBorder: string;
        fragmentBorder: string;
        fragmentBackground: string;
        fragmentText: string;
        noteBackground: string;
        noteBorder: string;
        noteText: string;
        selection: string;
        selectionBackground: string;
    };
    typography: {
        fontFamily: string;
        fontSize: number;
    };
    geometry: {
        strokeWidth: number;
        messageStrokeWidth: number;
        cornerRadius: number;
    };
}

export const DEFAULT_THEME: SequenceTheme = {
    colors: {
        background: '#ffffff',
        actorBorder: '#333333',
        actorBackground: '#ffffff',
        actorText: '#000000',
        lifeline: '#999999',
        message: '#333333',
        messageText: '#000000',
        activation: '#ffffff',
        activationBorder: '#333333',
        fragmentBorder: '#555555',
        fragmentBackground: 'rgba(0, 0, 0, 0.02)',
        fragmentText: '#555555',
        noteBackground: '#fff9c4',
        noteBorder: '#d4a017',
        noteText: '#000000',
        selection: '#0064ff',
        selectionBackground: 'rgba(0, 100, 255, 0.05)',
    },
    typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: 14,
    },
    geometry: {
        strokeWidth: 2,
        messageStrokeWidth: 1.5,
        cornerRadius: 4,
    }
};

export const REACT_FLOW_THEME: SequenceTheme = {
    colors: {
        background: '#ffffff',
        actorBorder: '#222222',
        actorBackground: '#ffffff',
        actorText: '#222222',
        lifeline: '#999999',
        message: '#555555',
        messageText: '#555555',
        activation: '#ffffff',
        activationBorder: '#555555',
        fragmentBorder: '#555555',
        fragmentBackground: 'rgba(0, 0, 0, 0.02)',
        fragmentText: '#555555',
        noteBackground: '#fff',
        noteBorder: '#222',
        noteText: '#222',
        selection: '#ff0072', // Distinctive React Flow Pink
        selectionBackground: 'rgba(255, 0, 114, 0.1)',
    },
    typography: {
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 12,
    },
    geometry: {
        strokeWidth: 1,
        messageStrokeWidth: 1,
        cornerRadius: 3,
    }
};

export const LUCID_THEME: SequenceTheme = {
    colors: {
        background: '#ffffff',
        actorBorder: '#333333',
        actorBackground: '#f5f5f5', // Slight gray header
        actorText: '#333333',
        lifeline: '#999999',
        message: '#333333',
        messageText: '#333333',
        activation: '#ffffff',
        activationBorder: '#333333',
        fragmentBorder: '#aaaaaa',
        fragmentBackground: 'rgba(0, 0, 0, 0.03)',
        fragmentText: '#666666',
        noteBackground: '#fff3cd', // Classic yellow note
        noteBorder: '#d4a017',
        noteText: '#333333',
        selection: '#29b6f6', // Light Blue selection
        selectionBackground: 'rgba(41, 182, 246, 0.1)',
    },
    typography: {
        fontFamily: '"Liberation Sans", "Arial", sans-serif',
        fontSize: 13,
    },
    geometry: {
        strokeWidth: 1.5,
        messageStrokeWidth: 1.5,
        cornerRadius: 2,
    }
};
