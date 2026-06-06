export interface Call {
  callId: string;
  flowId: string;
  source: string;
  destination: string;
  method: string;
  path: string;
  status: string;
  durationMs: number;
  startTime: string;
  endTime?: string;
  order: number;
  requestHeaders?: string;
  requestBody?: string;
}

export interface Flow {
  flowId: string;
  rootCall: string;
  calls: Call[];
  services: string[];
  startTime: string;
  updatedAt: string;
  status: 'active' | 'complete';
}

export type WSMessage =
  | { type: 'flow_update'; payload: Flow }
  | { type: 'flow_complete'; payload: Flow }
  | { type: 'flow_list'; payload: Flow[] };
