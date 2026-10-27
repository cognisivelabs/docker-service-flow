"use client";

import React, { useMemo } from 'react';
import { Flow, Call } from '@/types/flow';
import { callsOverlap } from '@/utils/flow';
import { SequenceDiagram, type Actor, type Message, type Fragment, DEFAULT_THEME } from 'react-sequence-kit';

interface SequenceViewProps {
    flow: Flow | null;
}

/**
 * Collapse consecutive identical calls into one representative + loop fragment.
 */
function detectLoops(calls: Call[]): { collapsed: Call[]; fragments: Fragment[] } {
    const collapsed: Call[] = [];
    const fragments: Fragment[] = [];

    let i = 0;
    while (i < calls.length) {
        const current = calls[i];
        const key = `${current.source}->${current.destination}:${current.method}:${current.path}`;

        let count = 1;
        while (i + count < calls.length) {
            const next = calls[i + count];
            const nextKey = `${next.source}->${next.destination}:${next.method}:${next.path}`;
            if (nextKey === key) {
                count++;
            } else {
                break;
            }
        }

        if (count >= 2) {
            const representative = { ...current };
            collapsed.push(representative);
            fragments.push({
                id: `loop-${representative.callId}`,
                type: 'loop',
                label: `${count}x`,
                startMessageId: `${representative.callId}-req`,
                endMessageId: representative.status && representative.status !== 'pending'
                    ? `${representative.callId}-resp`
                    : `${representative.callId}-req`,
            });
            i += count;
        } else {
            collapsed.push(current);
            i++;
        }
    }

    return { collapsed, fragments };
}

/**
 * Detect parallel calls: same source, different destinations, and in flight at
 * the same time as every other call in the group. Groups them into a par fragment.
 */
function detectParallel(calls: Call[]): Fragment[] {
    const fragments: Fragment[] = [];
    const used = new Set<number>();

    for (let i = 0; i < calls.length; i++) {
        if (used.has(i)) continue;

        const current = calls[i];
        const parallelGroup: number[] = [i];

        for (let j = i + 1; j < calls.length; j++) {
            if (used.has(j)) continue;
            const candidate = calls[j];

            if (
                candidate.source === current.source &&
                parallelGroup.every(idx =>
                    calls[idx].destination !== candidate.destination && callsOverlap(calls[idx], candidate))
            ) {
                parallelGroup.push(j);
            }
        }

        if (parallelGroup.length >= 2) {
            parallelGroup.forEach(idx => used.add(idx));

            const firstCall = calls[parallelGroup[0]];
            const lastCall = calls[parallelGroup[parallelGroup.length - 1]];

            const endMsgId = lastCall.status && lastCall.status !== 'pending'
                ? `${lastCall.callId}-resp`
                : `${lastCall.callId}-req`;

            fragments.push({
                id: `par-${firstCall.callId}`,
                type: 'par',
                label: `${parallelGroup.length} concurrent`,
                startMessageId: `${firstCall.callId}-req`,
                endMessageId: endMsgId,
                operands: parallelGroup.slice(1).map(idx => ({
                    condition: calls[idx].destination,
                    atMessageId: `${calls[idx].callId}-req`,
                })),
            });
        }
    }

    return fragments;
}

/**
 * Detect alt fragments: calls that returned error status codes.
 * Wraps the error call in an alt [success/error] box.
 */
function detectAlt(calls: Call[]): Fragment[] {
    const fragments: Fragment[] = [];

    calls.forEach(call => {
        if (call.status && (call.status.startsWith('4') || call.status.startsWith('5'))) {
            fragments.push({
                id: `alt-${call.callId}`,
                type: 'alt',
                label: 'response',
                startMessageId: `${call.callId}-req`,
                endMessageId: `${call.callId}-resp`,
                operands: [{
                    condition: `error ${call.status}`,
                    atMessageId: `${call.callId}-resp`,
                }],
            });
        }
    });

    return fragments;
}

export const SequenceView = ({ flow }: SequenceViewProps) => {
    const { actors, messages, fragments } = useMemo(() => {
        if (!flow) return { actors: [], messages: [], fragments: [] };

        const sortedCalls = [...flow.calls].sort((a, b) => a.order - b.order);

        // Step 1: Collapse loops
        const { collapsed, fragments: loopFragments } = detectLoops(sortedCalls);

        // Step 2: Build messages from collapsed calls
        const uniqueServices = new Set<string>();
        const msgs: Message[] = [];

        collapsed.forEach((call, index) => {
            uniqueServices.add(call.source);
            uniqueServices.add(call.destination);

            msgs.push({
                id: `${call.callId}-req`,
                from: call.source,
                to: call.destination,
                label: `${call.method} ${call.path}`.trim() || 'Traffic',
                type: call.source === call.destination ? 'async' : 'sync',
                order: index * 2,
            });

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

        // Step 3: Detect par fragments
        const parFragments = detectParallel(collapsed);

        // Step 4: Detect alt fragments (error responses)
        const altFragments = detectAlt(collapsed);

        // Combine all fragments
        const allFragments = [...loopFragments, ...parFragments, ...altFragments];

        const actorList: Actor[] = Array.from(uniqueServices)
            .map((name, i) => ({
                id: name,
                name: name,
                order: i,
            }));

        return { actors: actorList, messages: msgs, fragments: allFragments };
    }, [flow]);

    return (
        <div className="w-full h-full bg-slate-50 p-4 overflow-hidden">
            {flow && actors.length > 0 ? (
                <SequenceDiagram
                    actors={actors}
                    messages={messages}
                    fragments={fragments.length > 0 ? fragments : undefined}
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
