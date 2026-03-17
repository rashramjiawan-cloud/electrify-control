import { useState } from 'react';

interface Props {
  connected: boolean;
  addToast: (msg: string, type?: string) => void;
  addLog: (time: string, msg: string, type: string) => void;
}

const now = () => new Date().toTimeString().slice(0, 8);

const ECCChargingProfiles = ({ connected, addToast, addLog }: Props) => {
  const [profiles, setProfiles] = useState([
    { id: 1, stack: 0, purpose: 'TxDefaultProfile', kind: 'Absolute', unit: 'A', limit: 0, phases: 3 },
    { id: 2, stack: 0, purpose: 'TxDefaultProfile', kind: 'Absolute', unit: 'A', limit: 0, phases: 3 },
  ]);

  const updateProfile = (idx: number, field: string, value: string | number) => {
    setProfiles(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const setChargingProfile = (connectorIdx: number) => {
    const p = profiles[connectorIdx];
    addToast(`Connector ${connectorIdx + 1}: Laadprofiel ingesteld op ${p.limit}${p.unit}`, 'ok');
    addLog(now(), `SetChargingProfile connectorId:${connectorIdx + 1} limit:${p.limit}${p.unit} purpose:${p.purpose}`, 'ocpp');
  };

  const clearProfile = (connectorIdx: number) => {
    updateProfile(connectorIdx, 'limit', 0);
    addToast(`Connector ${connectorIdx + 1}: Laadprofiel verwijderd`, 'warn');
  };

  const getTimelineColor = (limit: number) => {
    return limit === 0 ? 'rgba(255,59,78,0.4)' : `rgba(0,${Math.floor(80 + limit * 5)},255,0.7)`;
  };

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Laad</span>profielen</div>
          <div className="ecc-page-sub">SetChargingProfile — OCPP Smart Charging</div>
        </div>
      </div>
      <div className="ecc-content-area">
        <div className="ecc-grid-2">
          {profiles.map((p, idx) => (
            <div key={idx} className="ecc-card">
              <div className="ecc-card-title">Connector {idx + 1} Profiel</div>
              <div className="ecc-form-row">
                <div className="ecc-form-group">
                  <label>Profiel ID</label>
                  <input className="ecc-input" type="number" value={p.id} onChange={e => updateProfile(idx, 'id', parseInt(e.target.value))} />
                </div>
                <div className="ecc-form-group">
                  <label>Stack Level</label>
                  <input className="ecc-input" type="number" value={p.stack} onChange={e => updateProfile(idx, 'stack', parseInt(e.target.value))} />
                </div>
              </div>
              <div className="ecc-form-row">
                <div className="ecc-form-group">
                  <label>Doel</label>
                  <select className="ecc-select" value={p.purpose} onChange={e => updateProfile(idx, 'purpose', e.target.value)}>
                    <option value="TxDefaultProfile">TxDefaultProfile</option>
                    <option value="TxProfile">TxProfile</option>
                    <option value="ChargePointMaxProfile">ChargePointMaxProfile</option>
                  </select>
                </div>
                <div className="ecc-form-group">
                  <label>Soort</label>
                  <select className="ecc-select" value={p.kind} onChange={e => updateProfile(idx, 'kind', e.target.value)}>
                    <option value="Absolute">Absolute</option>
                    <option value="Recurring">Recurring</option>
                    <option value="Relative">Relative</option>
                  </select>
                </div>
              </div>
              <div className="ecc-form-row">
                <div className="ecc-form-group">
                  <label>Eenheid</label>
                  <select className="ecc-select" value={p.unit} onChange={e => updateProfile(idx, 'unit', e.target.value)}>
                    <option value="A">Ampère (A)</option>
                    <option value="W">Watt (W)</option>
                  </select>
                </div>
                <div className="ecc-form-group">
                  <label>Max Stroom / Limiet</label>
                  <input className="ecc-input" type="number" value={p.limit} min={0} max={32} onChange={e => updateProfile(idx, 'limit', parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="ecc-form-row">
                <div className="ecc-form-group">
                  <label>Aantal Fasen</label>
                  <select className="ecc-select" value={p.phases} onChange={e => updateProfile(idx, 'phases', parseInt(e.target.value))}>
                    <option value={1}>1-fase</option>
                    <option value={3}>3-fase</option>
                  </select>
                </div>
              </div>
              <div className="ecc-btn-row" style={{ marginTop: 8 }}>
                <button className="ecc-btn ecc-btn-primary" onClick={() => setChargingProfile(idx)}>⚡ Instellen</button>
                <button className="ecc-btn ecc-btn-danger" onClick={() => clearProfile(idx)}>✕ Verwijderen</button>
              </div>
            </div>
          ))}
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">Visueel Profiel</div>
          <div className="ecc-timeline-labels">
            <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span>
          </div>
          {profiles.map((p, idx) => (
            <div key={idx}>
              <div className="ecc-profile-timeline">
                <div className="ecc-profile-slot" style={{ width: '100%', background: getTimelineColor(p.limit) }}>
                  {p.limit}A
                </div>
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: 'var(--ecc-text2)', marginBottom: idx === 0 ? 12 : 0 }}>
                CONNECTOR {idx + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default ECCChargingProfiles;
