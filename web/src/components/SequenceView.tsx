"use client";

import React, { useMemo } from 'react';
import { Flow } from '@/types/flow';
import { SequenceDiagram, type Actor, type Message, DEFAULT_THEME } from '../lib/react-sequence-kit';

interface SequenceViewProps {
    flow: Flow | null;
}

export const SequenceView = ({ flow }: SequenceViewProps) => {
    const { actors, messages } = useMemo(() => {
        if (!flow) return { actors: [], messages: [] };

        const uniqueServices = new Set<string>();
        const msgs: Message[] = [];

        const sortedCalls = [...flow.calls].sort((a, b) => a.order - b.order);

        sortedCalls.forEach((call, index) => {
            uniqueServices.add(call.source);
            uniqueServices.add(call.destination);

            // Request arrow
            msgs.push({
                id: `${call.callId}-req`,
                from: call.source,
                to: call.destination,
                label: `${call.method} ${call.path}`.trim() || 'Traffic',
                type: 'sync',
                order: index * 2,
            });

            // Reply arrow (if we have a response)
            if (call.status && call.status !== 'pending') {
                msgs.push({
                    id: `${call.callId}-resp`,
                    from: call.destination,
                    to: call.source,
                    label: `${call.status}${call.durationMs ? ` (${call.durationMs}ms)` : ''}`,
                    type: 'reply',
                    order: index * 2 + 1,
                });
            }
        });

        const actorList: Actor[] = Array.from(uniqueServices)
            .map((name, i) => ({
                id: name,
                name: name,
                stereotype: 'actor' as const,
                order: i,
            }));

        return { actors: actorList, messages: msgs };
    }, [flow]);

    return (
        <div className="w-full h-full bg-slate-50 p-4 overflow-hidden">
            {flow && actors.length > 0 ? (
                <SequenceDiagram
                    actors={actors}
                    messages={messages}
                    config={{
                        actorSpacing: 250,
                        messageHeight: 60,
                        topMargin: 50,
                    }}
                    theme={{
                        ...DEFAULT_THEME,
                        colors: {
                            ...DEFAULT_THEME.colors,
                            actorBackground: '#ffffff',
                            actorBorder: '#000000',
                            actorText: '#000000',
                            lifeline: '#000000',
                            activation: '#e0e0e0',
                            message: '#000000',
                            messageText: '#000000',
                            noteBackground: '#fff',
                            noteBorder: '#000',
                            noteText: '#000',
                            selection: '#007bff',
                        },
                    }}
                />
            ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                    {flow ? 'No calls in this flow yet...' : 'Select a flow to view its sequence diagram'}
                </div>
            )}
        </div>
    );
};
