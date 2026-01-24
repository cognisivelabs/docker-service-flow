"use client";

import React, { useState, useEffect } from 'react';
import { Settings, RefreshCw, Power, X } from 'lucide-react';

interface NetworkInterface {
    name: string;
    address: string;
    type: string;
    icon: string;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
    const [selectedInterface, setSelectedInterface] = useState<string>('');
    const [status, setStatus] = useState<'stopped' | 'starting' | 'running' | 'failed'>('stopped');
    const [logs, setLogs] = useState<string[]>([]);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        // Check if running in Electron
        // @ts-ignore
        if (typeof window !== 'undefined' && window.electron) {
            setIsElectron(true);
            // @ts-ignore
            window.electron.getInterfaces().then(setInterfaces);

            // Listen for status updates
            // @ts-ignore
            window.electron.onBackendStatus((status, error) => {
                setStatus(status);
                if (error) addLog(`Error: ${error}`);
            });

            // Listen for backend stdout
            // @ts-ignore
            window.electron.onBackendLog((msg) => {
                addLog(msg);
            });
        }
    }, [isOpen]);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg].slice(-20)); // Keep last 20
    };

    const handleStart = () => {
        if (!selectedInterface) return;
        setStatus('starting');
        // @ts-ignore
        window.electron.startSniffer(selectedInterface);
    };

    const handleStop = () => {
        // @ts-ignore
        window.electron.stopSniffer();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-[600px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-white">Application Settings</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto">

                    {!isElectron && (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-4 rounded-lg text-sm">
                            ⚠️ You are viewing G-Flow in Web Mode. Interface scanning settings are only available in the Desktop App.
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Select Network Interface
                        </label>

                        <div className="border border-slate-700 rounded-xl bg-slate-950 overflow-hidden h-64 flex flex-col">
                            <div className="p-2 border-b border-slate-800 bg-slate-900/50 flex justify-end">
                                <button
                                    onClick={() => {
                                        // @ts-ignore
                                        if (isElectron) window.electron.getInterfaces().then(setInterfaces)
                                    }}
                                    className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    <RefreshCw className="w-3 h-3" /> Refresh List
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {interfaces.map((iface) => {
                                    const isSelected = selectedInterface === iface.name;
                                    const isRunning = status === 'running';
                                    const isDocker = iface.type === 'Docker Bridge';

                                    return (
                                        <button
                                            key={iface.name}
                                            onClick={() => setSelectedInterface(iface.name)}
                                            disabled={isRunning || !isElectron}
                                            className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all border ${isSelected
                                                ? 'bg-blue-600/10 border-blue-500 shadow-md shadow-blue-900/10'
                                                : 'bg-transparent border-transparent hover:bg-slate-800'
                                                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDocker ? 'bg-blue-500/20 text-blue-400' :
                                                iface.type.startsWith('Physical') ? 'bg-emerald-500/20 text-emerald-400' :
                                                    'bg-slate-800 text-slate-500'
                                                }`}>
                                                {isDocker ? <span className="font-bold text-xs">DKR</span> :
                                                    iface.type.startsWith('Physical') ? <Settings className="w-4 h-4" /> : // Placeholder icon
                                                        <span className="font-bold text-[10px]">{iface.name.substring(0, 2).toUpperCase()}</span>
                                                }
                                            </div>

                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                        {iface.name}
                                                    </span>
                                                    {iface.type && (
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${isDocker ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'
                                                            }`}>
                                                            {iface.type}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono mt-0.5">
                                                    {iface.address || 'No IPv4 Address'}
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-500 mt-2">
                            Select the <b>Docker Bridge</b> interface to capture container traffic. On Mac/Linux this is usually <code>br-xxxxx</code>.
                        </p>
                    </div>

                    {/* Status & Controls */}
                    <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-slate-300">Backend Status</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                                status === 'starting' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                                    status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                        'bg-slate-800 text-slate-500'
                                }`}>
                                {status}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            {status === 'running' ? (
                                <button
                                    onClick={handleStop}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-900/20"
                                >
                                    <Power className="w-4 h-4" /> Stop Sniffer
                                </button>
                            ) : (
                                <button
                                    onClick={handleStart}
                                    disabled={!selectedInterface || status === 'starting' || !isElectron}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                                >
                                    <Power className="w-4 h-4" /> Start Sniffer
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Console Logs */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Process Logs</span>
                            <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-white">Clear</button>
                        </div>
                        <div className="bg-black rounded-lg p-3 font-mono text-[10px] text-slate-400 h-32 overflow-y-auto border border-slate-800">
                            {logs.length === 0 && <span className="opacity-50 italic">Waiting for logs...</span>}
                            {logs.map((log, i) => (
                                <div key={i} className="mb-0.5 break-all">{log}</div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
