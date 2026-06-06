"use client";

import React from 'react';
import { Flow } from '@/types/flow';
import { getFlowLabel, getFlowDuration, formatTime } from '@/utils/flow';
import { Zap } from 'lucide-react';

interface FlowSelectorProps {
    flows: Flow[];
    selectedFlowId: string | null;
    onSelectFlow: (flowId: string | null) => void;
    autoFollow: boolean;
    onToggleAutoFollow: () => void;
}

export const FlowSelector = ({
    flows,
    selectedFlowId,
    onSelectFlow,
    autoFollow,
    onToggleAutoFollow,
}: FlowSelectorProps) => {
    return (
        <div className="w-72 border-r border-slate-800 bg-slate-900/50 flex flex-col h-full">
            <div className="p-3 border-b border-slate-800">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Flows</h2>
                    <span className="text-xs text-slate-500">{flows.length}</span>
                </div>
                <button
                    onClick={onToggleAutoFollow}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors w-full ${
                        autoFollow
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                >
                    <Zap className="w-3 h-3" />
                    Auto-follow {autoFollow ? 'ON' : 'OFF'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {flows.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                        Waiting for flows...
                    </div>
                ) : (
                    flows.map(flow => {
                        const isSelected = flow.flowId === selectedFlowId;
                        const duration = getFlowDuration(flow);

                        return (
                            <button
                                key={flow.flowId}
                                onClick={() => onSelectFlow(flow.flowId)}
                                className={`w-full text-left p-3 border-b border-slate-800/50 transition-colors ${
                                    isSelected
                                        ? 'bg-blue-600/10 border-l-2 border-l-blue-500'
                                        : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                        flow.status === 'active'
                                            ? 'bg-amber-400 animate-pulse'
                                            : 'bg-emerald-500'
                                    }`} />
                                    <span className="text-xs text-slate-300 font-mono truncate">
                                        {getFlowLabel(flow)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 ml-4 text-[10px] text-slate-500">
                                    <span>{flow.calls.length} call{flow.calls.length !== 1 ? 's' : ''}</span>
                                    <span>{flow.services.length} svc{flow.services.length !== 1 ? 's' : ''}</span>
                                    {duration !== null && <span>{duration}ms</span>}
                                    <span className="ml-auto">{formatTime(flow.startTime)}</span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};
