"use client";

import React, { useMemo, useEffect, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    MarkerType,
    Node,
    Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TrafficEvent } from '@/hooks/useWebSocket';

interface FlowCanvasProps {
    events: TrafficEvent[];
}

export const FlowCanvas = ({ events }: FlowCanvasProps) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        const newNodes: Node[] = [...nodes];
        const newEdges: Edge[] = [...edges];
        let updated = false;

        events.forEach((event) => {
            // Add or update source node
            if (!newNodes.find((n) => n.id === event.source)) {
                newNodes.push({
                    id: event.source,
                    data: { label: event.source },
                    position: { x: Math.random() * 400, y: Math.random() * 400 },
                    style: { background: '#1e293b', color: '#fff', borderRadius: '8px', padding: '10px' },
                });
                updated = true;
            }

            // Add or update destination node
            if (!newNodes.find((n) => n.id === event.destination)) {
                newNodes.push({
                    id: event.destination,
                    data: { label: event.destination },
                    position: { x: Math.random() * 400, y: Math.random() * 400 },
                    style: { background: '#1e293b', color: '#fff', borderRadius: '8px', padding: '10px' },
                });
                updated = true;
            }

            // Add or update edge
            const edgeId = `${event.source}-${event.destination}`;
            const existingEdgeIndex = newEdges.findIndex((e) => e.id === edgeId);

            const labelText = event.metadata.method ? `${event.metadata.method} ${event.metadata.path || ''}` : 'Traffic';
            const edgeColor = event.metadata.method ? '#22c55e' : '#3b82f6'; // Green for HTTP, Blue for others

            if (existingEdgeIndex === -1) {
                newEdges.push({
                    id: edgeId,
                    source: event.source,
                    target: event.destination,
                    label: labelText,
                    animated: true,
                    style: { stroke: edgeColor, strokeWidth: 2 },
                    labelStyle: { fill: '#ffffff', fontWeight: 700 },
                    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
                });
                updated = true;
            } else {
                // Update existing edge to show latest activity
                if (newEdges[existingEdgeIndex].label !== labelText) {
                    newEdges[existingEdgeIndex] = {
                        ...newEdges[existingEdgeIndex],
                        label: labelText,
                        style: { ...newEdges[existingEdgeIndex].style, stroke: edgeColor },
                        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
                    };
                    updated = true;
                }
            }
        });

        if (updated) {
            setNodes(newNodes);
            setEdges(newEdges);
        }
    }, [events]);

    return (
        <div className="w-full h-full bg-slate-900">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
            >
                <Background color="#334155" gap={20} />
                <Controls />
            </ReactFlow>
        </div>
    );
};
