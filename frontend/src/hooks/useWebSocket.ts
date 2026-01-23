"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TrafficEvent {
  source: string;
  destination: string;
  metadata: {
    method?: string;
    path?: string;
    timestamp: string;
  };
  requestBody?: string;
  requestHeaders?: string;
  status?: string;
  durationMs?: number;
}

export const useWebSocket = (url: string) => {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

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
          const data: TrafficEvent = JSON.parse(event.data);
          setEvents((prev) => [data, ...prev].slice(0, 100)); // Keep last 100 events
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

  return { events, isConnected };
};
