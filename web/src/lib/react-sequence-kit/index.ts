// Export React Components
export { SequenceDiagram } from './react/SequenceDiagram';
export type { SequenceDiagramProps, SelectionEvent } from './react/SequenceDiagram';

// Export Theming
export { DEFAULT_THEME, REACT_FLOW_THEME, LUCID_THEME, type SequenceTheme } from './react/theme';

// Export Engine Types (for constructing data)
export type { Actor, Message, Fragment, DiagramData } from './engine/model.types';
export type { LayoutConfig } from './engine/engine.types';

// Export Utilities
export { downloadJSON, downloadPNG, downloadSVG } from './react/exportUtils';
import './index.css';
