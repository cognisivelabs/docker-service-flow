import { useState } from 'react';
import { SequenceDiagram, type SelectionEvent } from './react/SequenceDiagram';
import { DEFAULT_THEME, REACT_FLOW_THEME, LUCID_THEME, type SequenceTheme } from './react/theme';
import type { Actor, Message, Fragment } from './engine/model.types';

// Demo Data: Bank Transaction
const ACTORS: Actor[] = [
  { id: 'user', name: 'Customer' },
  { id: 'atm', name: 'ATM' },
  { id: 'bank', name: 'Bank Server' },
  { id: 'acct', name: 'Account System' },
];

const MESSAGES: Message[] = [
  { id: 'm1', from: 'user', to: 'atm', label: 'insertCard()', type: 'sync' },
  { id: 'm2', from: 'atm', to: 'user', label: 'requestPin()', type: 'reply' },
  { id: 'm3', from: 'user', to: 'atm', label: 'enterPin(1234)', type: 'sync' },
  { id: 'm4', from: 'atm', to: 'bank', label: 'verifyPin()', type: 'sync' },
  { id: 'm5', from: 'bank', to: 'acct', label: 'checkPin()', type: 'sync' },
  { id: 'm6', from: 'acct', to: 'bank', label: 'pinOk', type: 'reply' },
  { id: 'm7', from: 'bank', to: 'atm', label: 'authSuccess', type: 'reply' },
  { id: 'm7a', from: 'atm', to: 'user', label: 'showMenu()', type: 'reply' },

  // Withdrawal Loop
  { id: 'm8', from: 'user', to: 'atm', label: 'withdraw(100)', type: 'sync' },
  { id: 'm9', from: 'atm', to: 'bank', label: 'processWithdrawal()', type: 'sync' },
  { id: 'm10', from: 'bank', to: 'bank', label: 'logTransaction()', type: 'sync' },
  { id: 'm11', from: 'bank', to: 'acct', label: 'debit(100)', type: 'sync' },
  { id: 'm12', from: 'acct', to: 'bank', label: 'balanceOk', type: 'reply' },
  { id: 'm13', from: 'bank', to: 'atm', label: 'dispenseCash', type: 'reply' },
  { id: 'm14', from: 'atm', to: 'user', label: 'takeCash()', type: 'reply' },
];

const FRAGMENTS: Fragment[] = [
  {
    id: 'f1',
    type: 'alt',
    label: 'Pin Verification',
    startMessageId: 'm4',
    endMessageId: 'm7'
  },
  {
    id: 'f2',
    type: 'loop',
    label: 'Retry if invalid',
    startMessageId: 'm2',
    endMessageId: 'm3'
  }
];

import { useRef } from 'react';
import { downloadJSON, downloadSVG, downloadPNG } from './react/exportUtils';
// ... previous imports

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<SequenceTheme>(DEFAULT_THEME);
  const [themeName, setThemeName] = useState<'default' | 'reactflow' | 'lucid'>('default');

  // Ref for the container to find the SVG
  const apiRef = useRef<HTMLDivElement>(null);

  const handleExport = (type: 'json' | 'png' | 'svg') => {
    if (type === 'json') {
      const exportData = { actors: ACTORS, messages: MESSAGES, fragments: FRAGMENTS };
      downloadJSON(exportData, 'diagram.json');
    } else {
      const svg = apiRef.current?.querySelector('svg');
      if (!svg) {
        alert('Could not find diagram SVG');
        return;
      }
      if (type === 'svg') downloadSVG(svg, 'diagram.svg');
      if (type === 'png') downloadPNG(svg, 'diagram.png');
    }
  };

  const handleSelect = (event: SelectionEvent | null) => {
    // ... same
    console.log('Selected:', event);
    setSelectedId(event ? event.id : null);
  };

  const toggleTheme = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // ... same
    const val = e.target.value as 'default' | 'reactflow' | 'lucid';
    setThemeName(val);
    if (val === 'reactflow') setCurrentTheme(REACT_FLOW_THEME);
    else if (val === 'lucid') setCurrentTheme(LUCID_THEME);
    else setCurrentTheme(DEFAULT_THEME);
  };

  return (
    <div style={{
      padding: 0,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, sans-serif'
    }}>
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>React Sequence Kit Demo</h1>
          <select
            value={themeName}
            onChange={toggleTheme}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #ccc',
              fontSize: '0.9rem'
            }}
          >
            <option value="default">Default Theme</option>
            <option value="reactflow">React Flow Theme</option>
            <option value="lucid">Lucid-like Theme</option>
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleExport('json')}
              style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
            >
              JSON
            </button>
            <button
              onClick={() => handleExport('svg')}
              style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
            >
              SVG
            </button>
            <button
              onClick={() => handleExport('png')}
              style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
            >
              PNG
            </button>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          {selectedId ? `Selection: ${selectedId}` : 'Click diagram elements to select'}
        </div>
      </header>

      <div style={{ flex: 1, backgroundColor: '#fafafa', padding: 24 }}>
        <div
          ref={apiRef}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            backgroundColor: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            overflow: 'hidden'
          }}>
          <SequenceDiagram
            actors={ACTORS}
            messages={MESSAGES}
            fragments={FRAGMENTS}
            selectedId={selectedId}
            onSelect={handleSelect}
            theme={currentTheme}
          />
        </div>
      </div>
    </div>
  )
}
