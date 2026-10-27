"use client";

import React, { useState } from 'react';
import { Call } from '@/types/flow';
import { getStatusColor, getMethodBadgeClasses } from '@/utils/style';
import { X, ArrowRight, Copy, Check, Clock, ArrowDown, ArrowUp } from 'lucide-react';

interface RequestInspectorProps {
    call: Call;
    onClose: () => void;
}

function tryFormatJSON(text: string): { formatted: string; isJSON: boolean } {
    try {
        const parsed = JSON.parse(text);
        return { formatted: JSON.stringify(parsed, null, 2), isJSON: true };
    } catch {
        return { formatted: text, isJSON: false };
    }
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button onClick={handleCopy} className="text-slate-500 hover:text-white transition-colors p-1">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

// Wrap a value in single quotes for a POSIX shell, escaping embedded single quotes.
function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function generateCurl(call: Call): string {
    let curl = `curl -X ${call.method} ${shellQuote(`http://${call.destination}${call.path}`)}`;

    if (call.requestHeaders) {
        const lines = call.requestHeaders.split('\r\n').filter(Boolean);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.toLowerCase().startsWith('host:')) {
                curl += ` \\\n  -H ${shellQuote(trimmed)}`;
            }
        });
    }

    if (call.requestBody) {
        curl += ` \\\n  --data-raw ${shellQuote(call.requestBody)}`;
    }

    return curl;
}

export const RequestInspector = ({ call, onClose }: RequestInspectorProps) => {
    const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');

    const reqBody = call.requestBody ? tryFormatJSON(call.requestBody) : null;
    const respBody = call.responseBody ? tryFormatJSON(call.responseBody) : null;
    const curlCommand = generateCurl(call);

    return (
        <div className="h-full flex flex-col bg-slate-950 border-t border-slate-800">
            {/* Header */}
            <div className="h-10 px-4 flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${getMethodBadgeClasses(call.method)}`}>
                    {call.method}
                </span>
                <span className="text-xs text-slate-300 font-mono truncate flex-1">{call.path}</span>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1 text-blue-400">{call.source}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="flex items-center gap-1 text-emerald-400">{call.destination}</span>
                </div>
                <span className={`font-bold text-xs ${getStatusColor(call.status)}`}>{call.status}</span>
                {call.durationMs > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock className="w-3 h-3" />{call.durationMs}ms
                    </span>
                )}
                <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-2">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 flex-shrink-0">
                <button
                    onClick={() => setActiveTab('request')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                        activeTab === 'request'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-900/50'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <ArrowUp className="w-3 h-3" /> Request
                </button>
                <button
                    onClick={() => setActiveTab('response')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                        activeTab === 'response'
                            ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-900/50'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <ArrowDown className="w-3 h-3" /> Response
                </button>

                {/* cURL copy button */}
                <div className="ml-auto flex items-center pr-3 gap-1">
                    <CopyButton text={curlCommand} />
                    <span className="text-[10px] text-slate-600">cURL</span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px]">
                {activeTab === 'request' ? (
                    <div className="space-y-4">
                        {/* Request Line */}
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Request</div>
                            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300">
                                {call.method} {call.path} HTTP/1.1
                            </div>
                        </div>

                        {/* Request Headers */}
                        {call.requestHeaders ? (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Headers</span>
                                    <CopyButton text={call.requestHeaders} />
                                </div>
                                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-blue-300 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                                    {call.requestHeaders}
                                </pre>
                            </div>
                        ) : (
                            <div className="text-slate-600 italic text-xs">No request headers captured</div>
                        )}

                        {/* Request Body */}
                        {reqBody ? (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                                        Body {reqBody.isJSON && <span className="text-emerald-600 ml-1">JSON</span>}
                                    </span>
                                    <CopyButton text={call.requestBody!} />
                                </div>
                                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-amber-300 whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                                    {reqBody.formatted}
                                </pre>
                            </div>
                        ) : (
                            <div className="text-slate-600 italic text-xs">No request body</div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Status Line */}
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Response</div>
                            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                                <span className="text-slate-500">HTTP/1.1 </span>
                                <span className={`font-bold ${getStatusColor(call.status)}`}>{call.status}</span>
                                {call.durationMs > 0 && (
                                    <span className="text-slate-600 ml-3">{call.durationMs}ms</span>
                                )}
                            </div>
                        </div>

                        {/* Response Headers */}
                        {call.responseHeaders ? (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Headers</span>
                                    <CopyButton text={call.responseHeaders} />
                                </div>
                                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-blue-300 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                                    {call.responseHeaders}
                                </pre>
                            </div>
                        ) : (
                            <div className="text-slate-600 italic text-xs">No response headers captured</div>
                        )}

                        {/* Response Body */}
                        {respBody ? (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                                        Body {respBody.isJSON && <span className="text-emerald-600 ml-1">JSON</span>}
                                    </span>
                                    <CopyButton text={call.responseBody!} />
                                </div>
                                <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-emerald-300 whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
                                    {respBody.formatted}
                                </pre>
                            </div>
                        ) : (
                            <div className="text-slate-600 italic text-xs">
                                {call.status === 'pending' ? 'Waiting for response...' : 'No response body captured'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
