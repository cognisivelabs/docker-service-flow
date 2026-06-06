"use client";

import React from 'react';
import { Flow } from '@/types/flow';
import { getFlowLabel, getRootCall } from '@/utils/flow';
import { Activity, ArrowRight } from 'lucide-react';

interface LiveFeedProps {
    flows: Flow[];
    onSelectFlow: (flowId: string) => void;
}

export const LiveFeed = ({ flows, onSelectFlow }: LiveFeedProps) => {
    return (
        <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                <h2 className="text-white font-semibold">Live Feed</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {flows.length === 0 && (
                    <p className="text-slate-500 text-sm text-center mt-10">Waiting for flows...</p>
                )}
                {flows.slice(0, 50).map((flow) => {
                    const root = getRootCall(flow);
                    return (
                        <button
                            key={flow.flowId}
                            onClick={() => onSelectFlow(flow.flowId)}
                            className="w-full text-left bg-slate-900 rounded-lg p-3 border border-slate-700 hover:border-blue-500 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${
                                        flow.status === 'active' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
                                    }`} />
                                    <span>{new Date(flow.startTime).toLocaleTimeString()}</span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                    {flow.calls.length} call{flow.calls.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            {root && (
                                <div className="flex items-center gap-2 text-sm text-slate-200 mb-1">
                                    <span className="truncate font-mono">{root.source}</span>
                                    <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                    <span className="truncate font-mono">{root.destination}</span>
                                </div>
                            )}
                            <div className="text-[10px] font-mono text-slate-500 truncate bg-slate-800/50 p-1 rounded">
                                {getFlowLabel(flow)}
                            </div>
                            {flow.services.length > 2 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {flow.services.slice(2).map(svc => (
                                        <span key={svc} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded">
                                            {svc}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
