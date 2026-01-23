"use client";

import React from 'react';
import { TrafficEvent } from '@/hooks/useWebSocket';
import { Activity, ArrowRight } from 'lucide-react';

interface LiveFeedProps {
    events: TrafficEvent[];
}

export const LiveFeed = ({ events }: LiveFeedProps) => {
    return (
        <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                <h2 className="text-white font-semibold">Live Feed</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {events.length === 0 && (
                    <p className="text-slate-500 text-sm text-center mt-10">Waiting for traffic...</p>
                )}
                {events.map((event, i) => (
                    <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700 hover:border-blue-500 transition-colors">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                            <span>{new Date(event.metadata.timestamp).toLocaleTimeString()}</span>
                            {event.metadata.method && (
                                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                                    {event.metadata.method}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-200">
                            <span className="truncate font-mono">{event.source}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            <span className="truncate font-mono">{event.destination}</span>
                        </div>
                        {event.metadata.path && (
                            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate bg-slate-800/50 p-1 rounded">
                                {event.metadata.path}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
