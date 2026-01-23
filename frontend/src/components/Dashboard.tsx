"use client";

import React, { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { FlowCanvas } from '@/components/FlowCanvas';
import { LiveFeed } from '@/components/LiveFeed';
import { SequenceView } from '@/components/SequenceView';
import { LogPanel } from '@/components/LogPanel';
import { LayoutGrid, ListTree, Activity, Globe } from 'lucide-react';

export default function Dashboard() {
    const { events, isConnected } = useWebSocket('ws://localhost:8085/ws');
    const [view, setView] = useState<'flow' | 'sequence'>('flow');

    return (
        <div className="flex flex-col h-screen bg-slate-900 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold tracking-tight">G-FLOW</h1>
                        <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                                {isConnected ? 'Live' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setView('flow')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'flow' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Graph View
                    </button>
                    <button
                        onClick={() => setView('sequence')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'sequence' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        <ListTree className="w-4 h-4" />
                        Sequence View
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Scanning Interface</p>
                        <p className="text-xs text-slate-300 font-mono">docker0</p>
                    </div>
                    <Globe className="w-5 h-5 text-slate-500" />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                {/* Visualization area */}
                <div className="flex-1 flex flex-col relative min-w-0">
                    <div className="flex-1 relative border-b border-slate-800">
                        {view === 'flow' ? (
                            <FlowCanvas events={events} />
                        ) : (
                            <SequenceView events={events} />
                        )}
                    </div>

                    {/* Bottom Log Panel */}
                    <div className="h-72">
                        <LogPanel events={events} />
                    </div>
                </div>

                {/* Sidebar */}
                <LiveFeed events={events} />
            </main>
        </div>
    );
}
