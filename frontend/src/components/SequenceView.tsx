"use client";

import React, { useMemo } from 'react';
import { TrafficEvent } from '@/hooks/useWebSocket';
import { SequenceDiagram, type Actor, type Message, DEFAULT_THEME } from '../lib/react-sequence-kit';


interface SequenceViewProps {
    events: TrafficEvent[];
}

export const SequenceView = ({ events }: SequenceViewProps) => {

    // Transform events into actors and messages
    const { actors, messages } = useMemo(() => {
        const uniqueServices = new Set<string>();
        const msgs: Message[] = [];

        events.forEach((e, index) => {
            uniqueServices.add(e.source);
            uniqueServices.add(e.destination);

            msgs.push({
                id: `msg-${index}`,
                from: e.source,
                to: e.destination,
                label: `${e.metadata.method || ''} ${e.metadata.path || ''}`.trim() || 'Traffic',
                type: 'sync', // Default to sync call
                order: index
            });
        });

        // Convert set to Actor objects
        const actorList: Actor[] = Array.from(uniqueServices)
            .sort()
            .map(name => ({
                id: name,
                name: name,
                stereotype: 'actor'
            }));

        return { actors: actorList, messages: msgs };
    }, [events]);

    return (
        <div className="w-full h-full bg-slate-50 p-4 overflow-hidden">
            {actors.length > 0 ? (
                <SequenceDiagram
                    actors={actors}
                    messages={messages}
                    config={{
                        actorSpacing: 250,
                        messageHeight: 60,
                        topMargin: 50
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
                            selection: '#007bff'
                        }
                    }}
                />
            ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                    Waiting for traffic...
                </div>
            )}
        </div>
    );
};
