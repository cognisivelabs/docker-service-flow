"use client";

import React, { useMemo, useEffect, memo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
    MarkerType,
    Node,
    Edge,
} from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as dagre from '@dagrejs/dagre';
import { Flow } from '@/types/flow';
import { isErrorStatus } from '@/utils/style';

const ServiceNode = memo(({ data }: NodeProps) => {
    return (
        <div style={{
            background: '#1e293b',
            color: '#fff',
            borderRadius: '8px',
            padding: '10px',
            border: '1px solid #334155',
            width: NODE_WIDTH,
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'center',
        }}>
            <Handle type="target" position={Position.Left} style={{ background: '#3b82f6' }} />
            {data.label as string}
            <Handle type="source" position={Position.Right} style={{ background: '#22c55e' }} />
        </div>
    );
});
ServiceNode.displayName = 'ServiceNode';

const nodeTypes = { service: ServiceNode };

interface FlowCanvasProps {
    flows: Flow[];
    selectedFlow: Flow | null;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;

interface EdgeData {
    source: string;
    target: string;
    labels: Set<string>;
    statuses: Set<string>;
    isSelected: boolean;
}

function collectGraphData(sourceFlows: Flow[], selectedFlowId?: string) {
    const serviceSet = new Set<string>();
    const edgeMap = new Map<string, EdgeData>();

    sourceFlows.forEach(flow => {
        const isSelected = selectedFlowId === flow.flowId;
        flow.calls.forEach(call => {
            serviceSet.add(call.source);
            serviceSet.add(call.destination);

            const edgeId = `${call.source}-${call.destination}`;
            const existing = edgeMap.get(edgeId);
            const label = `${call.method} ${call.path}`.trim() || 'Traffic';

            if (existing) {
                existing.labels.add(label);
                if (call.status && call.status !== 'pending') {
                    existing.statuses.add(call.status);
                }
                if (isSelected) existing.isSelected = true;
            } else {
                edgeMap.set(edgeId, {
                    source: call.source,
                    target: call.destination,
                    labels: new Set([label]),
                    statuses: new Set(call.status && call.status !== 'pending' ? [call.status] : []),
                    isSelected: isSelected,
                });
            }
        });
    });

    return { serviceSet, edgeMap };
}

function applyLayout(serviceSet: Set<string>, edgeMap: Map<string, EdgeData>): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 80 });
    g.setDefaultEdgeLabel(() => ({}));

    serviceSet.forEach(svc => {
        g.setNode(svc, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edgeMap.forEach(({ source, target }) => {
        g.setEdge(source, target);
    });

    dagre.layout(g);

    const nodes: Node[] = [];
    g.nodes().forEach(id => {
        const n = g.node(id);
        if (!n) return;
        nodes.push({
            id,
            type: 'service',
            data: { label: id },
            position: { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 },
        });
    });

    const edges: Edge[] = [];
    edgeMap.forEach((data, edgeId) => {
        const labelArr = Array.from(data.labels);
        const labelText = labelArr.length <= 2
            ? labelArr.join(', ')
            : `${labelArr[0]} +${labelArr.length - 1} more`;

        const hasError = Array.from(data.statuses).some(s => isErrorStatus(s));
        const edgeColor = hasError ? '#ef4444' : '#22c55e';

        edges.push({
            id: edgeId,
            source: data.source,
            target: data.target,
            label: labelText,
            animated: data.isSelected,
            style: { stroke: edgeColor, strokeWidth: 2 },
            labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: '10px' },
            labelBgStyle: { fill: '#1e293b', fillOpacity: 0.9 },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        });
    });

    return { nodes, edges };
}

function buildGraph(flows: Flow[], selectedFlow: Flow | null) {
    const sourceFlows = selectedFlow ? [selectedFlow] : flows;
    const { serviceSet, edgeMap } = collectGraphData(sourceFlows, selectedFlow?.flowId);
    return applyLayout(serviceSet, edgeMap);
}

export const FlowCanvas = ({ flows, selectedFlow }: FlowCanvasProps) => {
    const { nodes, edges } = useMemo(
        () => buildGraph(flows, selectedFlow),
        [flows, selectedFlow]
    );

    const [currentNodes, setCurrentNodes, onNodesChange] = useNodesState<Node>([]);
    const [currentEdges, setCurrentEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        setCurrentNodes(nodes);
        setCurrentEdges(edges);
    }, [nodes, edges]);

    return (
        <div className="w-full h-full bg-slate-900">
            <ReactFlow
                nodes={currentNodes}
                edges={currentEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
            >
                <Background color="#334155" gap={20} />
                <Controls />
            </ReactFlow>
        </div>
    );
};
