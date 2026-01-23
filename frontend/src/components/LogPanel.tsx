import React, { useEffect, useRef } from 'react';
import { TrafficEvent } from '@/hooks/useWebSocket';
import { Terminal, ArrowRight } from 'lucide-react';

interface LogPanelProps {
    events: TrafficEvent[];
}

export const LogPanel = ({ events }: LogPanelProps) => {
    const endRef = useRef<HTMLDivElement>(null);
    const [expandedId, setExpandedId] = React.useState<number | null>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    return (
        <div className="h-full flex flex-col bg-slate-950 border-t border-slate-800">
            <div className="h-9 px-4 flex items-center gap-2 border-b border-slate-800 bg-slate-900/50">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Execution Logs</span>
                <span className="ml-auto text-[10px] text-slate-500">{events.length} events capturing</span>
            </div>

            <div className="flex-1 overflow-y-auto p-0 font-mono text-[11px]">
                {events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">
                        No logs available. Waiting for traffic...
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-950 text-slate-500 border-b border-slate-800 z-10 text-[10px] uppercase">
                            <tr>
                                <th className="py-2 pl-4 w-28">Time</th>
                                <th className="py-2 w-20">Method</th>
                                <th className="py-2">Status</th>
                                <th className="py-2">Path</th>
                                <th className="py-2">Duration</th>
                                <th className="py-2 text-right pr-4">Service Flow</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event, idx) => (
                                <React.Fragment key={idx}>
                                    <tr
                                        onClick={() => setExpandedId(expandedId === idx ? null : idx)}
                                        className={`border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors cursor-pointer ${expandedId === idx ? 'bg-blue-500/10' : ''}`}
                                    >
                                        <td className="py-2 pl-4 text-slate-500">
                                            {event.metadata.timestamp ? new Date(event.metadata.timestamp).toLocaleTimeString() : '--:--:--'}
                                        </td>
                                        <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${event.metadata.method === 'GET' ? 'bg-blue-500/20 text-blue-400' :
                                                event.metadata.method === 'POST' ? 'bg-green-500/20 text-green-400' :
                                                    event.metadata.method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-slate-700 text-slate-300'
                                                }`}>
                                                {event.metadata.method || 'TCP'}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`font-bold ${event.status?.startsWith('2') ? 'text-emerald-500' :
                                                event.status?.startsWith('Pending') ? 'text-amber-500 animate-pulse' :
                                                    'text-red-400'
                                                }`}>
                                                {event.status || '-'}
                                            </span>
                                        </td>
                                        <td className="py-2 text-slate-300 truncate max-w-[200px]" title={event.metadata.path}>
                                            {event.metadata.path || '-'}
                                        </td>
                                        <td className="py-2 text-slate-400">
                                            {event.durationMs !== undefined ? `${event.durationMs}ms` : '-'}
                                        </td>
                                        <td className="py-2 text-right pr-4 text-slate-400 flex items-center justify-end gap-2">
                                            <span className="text-blue-400 font-semibold uppercase text-[10px] tracking-tight">{event.source}</span>
                                            <ArrowRight className="w-3 h-3 text-slate-600" />
                                            <span className="text-emerald-400 font-semibold uppercase text-[10px] tracking-tight">{event.destination}</span>
                                        </td>
                                    </tr>
                                    {expandedId === idx && (
                                        <tr className="bg-slate-900/40">
                                            <td colSpan={6} className="p-4 border-b border-blue-500/20 shadow-inner">
                                                <div className="space-y-3">
                                                    {event.requestHeaders && (
                                                        <div>
                                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Request Headers</p>
                                                            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-blue-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto shadow-xl">
                                                                {event.requestHeaders}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {event.requestBody && (
                                                        <div>
                                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Request Body</p>
                                                            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-blue-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto shadow-xl">
                                                                {event.requestBody}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {!event.requestBody && !event.requestHeaders && (
                                                        <p className="text-slate-600 italic">No request details captured.</p>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            <div ref={endRef} />
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
