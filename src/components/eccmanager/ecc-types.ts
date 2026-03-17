export interface ECCLogEntry {
  id: number;
  time: string;
  msg: string;
  type: 'info' | 'ok' | 'warn' | 'error' | 'ocpp' | 'gsm' | 'data';
}

export interface ECCDevice {
  id: string;
  serial: string;
  model: string;
  vendor: string;
  fw: string;
  hw: string;
}

export interface ECCConnector {
  id: number;
  status: 'Available' | 'Faulted' | 'Charging' | 'Preparing';
  errorCode: string;
  cpState: string;
  current: number;
  energy: number;
  profile: number;
}

export interface ECCGsm {
  signal: number;
  ip: string;
  apn: string;
}

export interface ECCOcppMessage {
  dir: 'OUT' | 'IN';
  action: string;
  seq: string;
  ts: string;
  type: 'req' | 'resp' | 'err';
  payload: string;
}

export interface ECCConfigRow {
  key: string;
  value: string;
  readonly: boolean;
}

export interface ECCState {
  connected: boolean;
  ocppConnected: boolean;
  device: ECCDevice;
  connectors: ECCConnector[];
  gsm: ECCGsm;
  logEntries: ECCLogEntry[];
  ocppMessages: ECCOcppMessage[];
  cfgData: ECCConfigRow[];
}

export type ECCPage = 'connection' | 'firmware' | 'dashboard' | 'ocpp' | 'log' | 'config' | 'charging' | 'remote';
