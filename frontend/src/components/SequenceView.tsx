"use client";

import React from 'react';
import { TrafficEvent } from '@/hooks/useWebSocket';

interface SequenceViewProps {
    events: TrafficEvent[];
}

export const SequenceView = ({ events }: SequenceViewProps) => {
    // Get unique services to act as columns
    const services = Array.from(new Set(events.flatMap(e => [e.source, e.destination]))).sort();

    return (
        <div className="w-full h-full bg-slate-900 overflow-auto p-8">
            <div className="min-w-max">
                {/* Header: Service Names */}
                <div className="flex gap-20 mb-8 sticky top-0 bg-slate-900 pb-4 z-10">
                    {services.map(service => (
                        <div key={service} className="flex flex-col items-center w-32">
                            <div className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm mb-2 shadow-lg">
                                {service}
                            </div>
                            <div className="w-px h-full border-l-2 border-dashed border-slate-700"></div>
                        </div>
                    ))}
                </div>

                {/* Traffic Lines */}
                <div className="relative space-y-8">
                    {events.map((event, i) => {
                        const srcIdx = services.indexOf(event.source);
                        const dstIdx = services.indexOf(event.destination);

                        if (srcIdx === -1 || dstIdx === -1) return null;

                        const left = Math.min(srcIdx, dstIdx) * 148 + 64; // 128 (w-32) + 20 (gap) approx
                        const width = Math.abs(srcIdx - dstIdx) * 148;
                        const isForward = srcIdx < dstIdx;

                        return (
                            <div key={i} className="relative h-12 flex items-center">
                                {/* Lifelines */}
                                <div className="absolute top-0 bottom-0 flex gap-20 pointer-events-none opacity-20">
                                    {services.map(s => <div key={s} className="w-32 flex justify-center"><div className="w-px h-full border-l-2 border-dashed border-slate-700"></div></div>)}
                                </div>

                                <div
                                    className="absolute animate-in fade-in slide-in-from-top-4 duration-500"
                                    style={{
                                        left: `${left}px`,
                                        width: `${width}px`,
                                    }}
                                >
                                    <div className={`relative h-0.5 bg-blue-500 flex items-center ${isForward ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {/* Arrow head */}
                                        <div className={`w-2 h-2 border-t-2 border-r-2 border-blue-500 transform ${isForward ? 'rotate-45' : 'rotate-[225deg]'}`}></div>

                                        {/* Label */}
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-blue-400 font-mono bg-slate-900 px-2 rounded border border-blue-500/20">
                                            {event.metadata.method} {event.metadata.path}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
