"use client";

import React from 'react';
import { Settings, X } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-[500px] shadow-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-white">About</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-300 mb-2">docker-service-flow</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Zero-config service flow visualizer for Docker microservices.
                            Sniffs traffic on Docker bridge interfaces to build live service maps
                            and sequence diagrams.
                        </p>
                    </div>

                    <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Mode</span>
                            <span className="text-slate-300 font-mono">Docker Compose</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Server</span>
                            <span className="text-emerald-400 font-mono">Running</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Interface</span>
                            <span className="text-slate-300 font-mono">Auto-detected</span>
                        </div>
                    </div>

                    <p className="text-[10px] text-slate-600 leading-relaxed">
                        Configure the network interface via the <code className="text-slate-400">INTERFACE</code> environment
                        variable in docker-compose.yml. By default, the sniffer auto-detects the Docker bridge
                        with the most active containers.
                    </p>
                </div>
            </div>
        </div>
    );
};
