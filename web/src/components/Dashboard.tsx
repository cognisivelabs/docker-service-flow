"use client";

import React, { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { FlowCanvas } from '@/components/FlowCanvas';
import { LiveFeed } from '@/components/LiveFeed';
import { SequenceView } from '@/components/SequenceView';
import { LogPanel } from '@/components/LogPanel';
import { FlowSelector } from '@/components/FlowSelector';
import { SettingsModal } from './SettingsModal';
import { Settings, LayoutGrid, ListTree, Activity } from 'lucide-react';

function getWebSocketUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3005/ws';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
}

export default function Dashboard() {
    const {
        flows,
        selectedFlow,
        selectedFlowId,
        selectFlow,
        autoFollow,
        toggleAutoFollow,
        isConnected,
    } = useWebSocket(getWebSocketUrl());
    const [view, setView] = useState<'flow' | 'sequence'>('flow');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <div className="flex flex-col h-screen bg-slate-900 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold tracking-tight">docker-service-flow</h1>
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
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Scanning</p>
                        <p className="text-xs text-slate-300 font-mono">
                            <button onClick={() => setIsSettingsOpen(true)} className="hover:text-white underline decoration-slate-600 underline-offset-2">
                                Configure
                            </button>
                        </p>
                    </div>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Main Content */}
            <main className="flex flex-1 overflow-hidden">
                {/* Flow Selector Sidebar */}
                <FlowSelector
                    flows={flows}
                    selectedFlowId={selectedFlowId}
                    onSelectFlow={selectFlow}
                    autoFollow={autoFollow}
                    onToggleAutoFollow={toggleAutoFollow}
                />

                {/* Visualization area */}
                <div className="flex-1 flex flex-col relative min-w-0">
                    <div className="flex-1 relative border-b border-slate-800">
                        {view === 'flow' ? (
                            <FlowCanvas flows={flows} selectedFlow={selectedFlow} />
                        ) : (
                            <SequenceView flow={selectedFlow} />
                        )}
                    </div>

                    {/* Bottom Log Panel */}
                    <div className="h-72">
                        <LogPanel flow={selectedFlow} />
                    </div>
                </div>

                {/* Right Sidebar */}
                <LiveFeed flows={flows} onSelectFlow={selectFlow} />
            </main>
        </div>
    );
}
