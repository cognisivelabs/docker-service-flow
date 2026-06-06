import React, { useState, useEffect, useRef } from 'react';
import { Flow } from '@/types/flow';
import { getStatusColor, getMethodBadgeClasses } from '@/utils/style';
import { Terminal, ArrowRight } from 'lucide-react';

interface LogPanelProps {
    flow: Flow | null;
}

export const LogPanel = ({ flow }: LogPanelProps) => {
    const endRef = useRef<HTMLDivElement>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const calls = flow ? [...flow.calls].sort((a, b) => a.order - b.order) : [];

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [calls.length]);

    return (
        <div className="h-full flex flex-col bg-slate-950 border-t border-slate-800">
            <div className="h-9 px-4 flex items-center gap-2 border-b border-slate-800 bg-slate-900/50">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Execution Logs</span>
                <span className="ml-auto text-[10px] text-slate-500">
                    {flow ? `${calls.length} call${calls.length !== 1 ? 's' : ''} in flow` : 'No flow selected'}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-0 font-mono text-[11px]">
                {!flow ? (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">
                        Select a flow to view its execution logs
                    </div>
                ) : calls.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">
                        No calls in this flow yet...
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-950 text-slate-500 border-b border-slate-800 z-10 text-[10px] uppercase">
                            <tr>
                                <th className="py-2 pl-4 w-10">#</th>
                                <th className="py-2 w-20">Method</th>
                                <th className="py-2">Status</th>
                                <th className="py-2">Path</th>
                                <th className="py-2">Duration</th>
                                <th className="py-2 text-right pr-4">Service Flow</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calls.map((call) => (
                                <React.Fragment key={call.callId}>
                                    <tr
                                        onClick={() => setExpandedId(expandedId === call.callId ? null : call.callId)}
                                        className={`border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors cursor-pointer ${expandedId === call.callId ? 'bg-blue-500/10' : ''}`}
                                    >
                                        <td className="py-2 pl-4 text-slate-600">{call.order + 1}</td>
                                        <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${getMethodBadgeClasses(call.method)}`}>
                                                {call.method || 'TCP'}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`font-bold ${getStatusColor(call.status)}`}>
                                                {call.status}
                                            </span>
                                        </td>
                                        <td className="py-2 text-slate-300 truncate max-w-[200px]" title={call.path}>
                                            {call.path || '-'}
                                        </td>
                                        <td className="py-2 text-slate-400">
                                            {call.durationMs > 0 ? `${call.durationMs}ms` : '-'}
                                        </td>
                                        <td className="py-2 text-right pr-4 text-slate-400 flex items-center justify-end gap-2">
                                            <span className="text-blue-400 font-semibold uppercase text-[10px] tracking-tight">{call.source}</span>
                                            <ArrowRight className="w-3 h-3 text-slate-600" />
                                            <span className="text-emerald-400 font-semibold uppercase text-[10px] tracking-tight">{call.destination}</span>
                                        </td>
                                    </tr>
                                    {expandedId === call.callId && (
                                        <tr className="bg-slate-900/40">
                                            <td colSpan={6} className="p-4 border-b border-blue-500/20 shadow-inner">
                                                <div className="space-y-3">
                                                    {call.requestHeaders && (
                                                        <div>
                                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Request Headers</p>
                                                            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-blue-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto shadow-xl">
                                                                {call.requestHeaders}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {call.requestBody && (
                                                        <div>
                                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Request Body</p>
                                                            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-blue-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto shadow-xl">
                                                                {call.requestBody}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {!call.requestBody && !call.requestHeaders && (
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
