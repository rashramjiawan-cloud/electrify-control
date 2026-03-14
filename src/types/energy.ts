export type ChargePointStatus = 'Available' | 'Charging' | 'Faulted' | 'Unavailable' | 'Preparing' | 'SuspendedEV' | 'Finishing';

export interface ChargePoint {
  id: string;
  name: string;
  model: string;
  vendor: string;
  serialNumber: string;
  status: ChargePointStatus;
  connectors: Connector[];
  lastHeartbeat: string;
  firmwareVersion: string;
  location: string;
  power: number; // kW
  energyDelivered: number; // kWh total
}

export interface Connector {
  id: number;
  status: ChargePointStatus;
  currentPower: number; // kW
  meterValue: number; // Wh
  activeTransaction?: Transaction;
}

export interface Transaction {
  id: number;
  idTag: string;
  startTime: string;
  stopTime?: string;
  meterStart: number;
  meterStop?: number;
  energyDelivered: number; // kWh
  cost?: number;
  status: 'Active' | 'Completed' | 'Failed';
}

