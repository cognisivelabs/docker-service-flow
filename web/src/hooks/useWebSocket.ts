"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Flow, WSMessage } from '@/types/flow';

export const useWebSocket = (url: string) => {
  const [flows, setFlows] = useState<Map<string, Flow>>(new Map());
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;

  useEffect(() => {
    const connect = () => {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket Connected');
      };

      socket.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          switch (msg.type) {
            case 'flow_list': {
              setFlows(prev => {
                const next = new Map(prev);
                msg.payload.forEach(f => next.set(f.flowId, f));
                return next;
              });
              break;
            }
            case 'flow_update':
            case 'flow_complete': {
              const flow = msg.payload;
              setFlows(prev => {
                const next = new Map(prev);
                next.set(flow.flowId, flow);
                return next;
              });
              if (autoFollowRef.current && msg.type === 'flow_update') {
                setSelectedFlowId(flow.flowId);
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket Disconnected, retrying in 3s...');
        setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
      };
    };

    connect();

    return () => {
      socketRef.current?.close();
    };
  }, [url]);

  const selectFlow = useCallback((flowId: string | null) => {
    setSelectedFlowId(flowId);
    setAutoFollow(false);
  }, []);

  const toggleAutoFollow = useCallback(() => {
    setAutoFollow(prev => !prev);
  }, []);

  const flowsArray = Array.from(flows.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const selectedFlow = selectedFlowId ? flows.get(selectedFlowId) ?? null : null;

  return {
    flows: flowsArray,
    selectedFlow,
    selectedFlowId,
    selectFlow,
    autoFollow,
    toggleAutoFollow,
    isConnected,
  };
};
