import { useState } from 'react';

interface Props {
  connected: boolean;
  addToast: (msg: string, type?: string) => void;
  addLog: (time: string, msg: string, type: string) => void;
  showModal: (title: string, body: string, cb: () => void) => void;
}

const now = () => new Date().toTimeString().slice(0, 8);

const CONNECTOR_ACTIONS = [
  { key: 'startTransaction', icon: '▶', label: 'Remote Start' },
  { key: 'stopTransaction', icon: '⏹', label: 'Remote Stop' },
  { key: 'unlockConnector', icon: '🔓', label: 'Ontgrendelen' },
  { key: 'changeAvailability', icon: '⚡', label: 'Beschikbaarheid' },
  { key: 'getConfiguration', icon: '📋', label: 'GetConfiguration' },
  { key: 'triggerMessage', icon: '📡', label: 'TriggerMessage' },
];

const SYSTEM_ACTIONS = [
  { key: 'reset-soft', icon: '↻', label: 'Soft Reset', iconColor: 'var(--ecc-warn)' },
  { key: 'reset-hard', icon: '⚡', label: 'Hard Reset', iconColor: 'var(--ecc-error)' },
  { key: 'updateFirmware', icon: '⬆', label: 'FW Update' },
];

const ACTION_LABELS: Record<string, string> = {
  startTransaction: 'Remote Start Transaction',
  stopTransaction: 'Remote Stop Transaction',
  unlockConnector: 'Ontgrendel Connector',
  changeAvailability: 'Verander Beschikbaarheid',
  getConfiguration: 'GetConfiguration',
  triggerMessage: 'TriggerMessage',
  'reset-soft': 'Soft Reset',
  'reset-hard': 'Hard Reset',
  updateFirmware: 'Firmware Update',
};

const ECCRemoteActions = ({ connected, addToast, addLog, showModal }: Props) => {
  const [manualAction, setManualAction] = useState('BootNotification');
  const [manualConnector, setManualConnector] = useState('0');
  const [manualPayload, setManualPayload] = useState('{}');

  const handleAction = (action: string) => {
    if (!connected) { addToast('Verbind eerst met de laadpaal!', 'error'); return; }
    const label = ACTION_LABELS[action] || action;
    showModal(label, `${label} versturen naar de laadpaal?`, () => {
      addToast(`${label} verstuurd`, 'ok');
      addLog(now(), `OCPP OUT: ${label}`, 'ocpp');
    });
  };

  const sendManual = () => {
    addToast(`${manualAction} verstuurd`, 'ok');
    addLog(now(), `[2,"${Date.now()}","${manualAction}",${manualPayload}]`, 'ocpp');
  };

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Remote</span> Actions</div>
          <div className="ecc-page-sub">OCPP remote commando's naar de laadpaal sturen</div>
        </div>
      </div>
      <div className="ecc-content-area">
        <div className="ecc-card">
          <div className="ecc-card-title">Connector Acties</div>
          <div className="ecc-action-grid">
            {CONNECTOR_ACTIONS.map(a => (
              <div key={a.key} className="ecc-action-card" onClick={() => handleAction(a.key)}>
                <div className="ecc-action-icon">{a.icon}</div>
                <div className="ecc-action-label">{a.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">Systeem Acties</div>
          <div className="ecc-action-grid">
            {SYSTEM_ACTIONS.map(a => (
              <div key={a.key} className="ecc-action-card" onClick={() => handleAction(a.key)}>
                <div className="ecc-action-icon" style={a.iconColor ? { color: a.iconColor } : undefined}>{a.icon}</div>
                <div className="ecc-action-label">{a.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">OCPP Handmatig Bericht</div>
          <div className="ecc-form-row">
            <div className="ecc-form-group">
              <label>Action</label>
              <select className="ecc-select" value={manualAction} onChange={e => setManualAction(e.target.value)}>
                {['BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'StopTransaction', 'MeterValues'].map(a => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Connector ID</label>
              <select className="ecc-select" value={manualConnector} onChange={e => setManualConnector(e.target.value)}>
                <option value="0">0 (Globaal)</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
          </div>
          <div className="ecc-form-group" style={{ marginBottom: 12 }}>
            <label>Payload (JSON)</label>
            <textarea className="ecc-textarea" rows={3} value={manualPayload} onChange={e => setManualPayload(e.target.value)} />
          </div>
          <div className="ecc-btn-row">
            <button className="ecc-btn ecc-btn-primary" onClick={sendManual}>📤 Versturen</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ECCRemoteActions;
