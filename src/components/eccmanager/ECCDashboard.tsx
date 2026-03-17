import type { ECCState } from './ecc-types';

interface Props {
  state: ECCState;
}

const EVENTS = [
  { t: '20:08:10', msg: 'CH[0] KWH error - Modbus communicatiefout', cls: 'error' },
  { t: '20:08:11', msg: 'CH[1] RFID reader fout gedetecteerd', cls: 'warn' },
  { t: '20:08:20', msg: 'OCPP BootNotification geaccepteerd', cls: 'ok' },
  { t: '20:08:24', msg: 'StatusNotification: Connector 1 Faulted', cls: 'warn' },
  { t: '20:13:20', msg: 'Heartbeat verstuurd', cls: 'info' },
];

function getConnectorBadge(status: string) {
  switch (status) {
    case 'Available': return { cls: 'ecc-badge-ok', text: '● BESCHIKBAAR' };
    case 'Faulted': return { cls: 'ecc-badge-error', text: '✕ FOUT' };
    case 'Charging': return { cls: 'ecc-badge-info', text: '⚡ LADEN' };
    case 'Preparing': return { cls: 'ecc-badge-warn', text: '◎ VOORBEREIDING' };
    default: return { cls: 'ecc-badge-off', text: '—' };
  }
}

const ECCDashboard = ({ state }: Props) => {
  const sig = state.gsm.signal;
  const activeCount = sig > 25 ? 5 : sig > 18 ? 4 : sig > 12 ? 3 : sig > 6 ? 2 : 1;

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Live</span> Dashboard</div>
          <div className="ecc-page-sub">Realtime status van beide laadpunten</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="ecc-btn ecc-btn-outline" style={{ fontSize: 12 }}>↻ Vernieuwen</button>
        </div>
      </div>
      <div className="ecc-content-area">
        {/* System stats */}
        <div className="ecc-grid-3" style={{ marginBottom: 16 }}>
          <div className="ecc-card" style={{ margin: 0, padding: 16 }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--ecc-text2)', letterSpacing: '1.5px', marginBottom: 8 }}>OCPP STATUS</div>
            <div className={`ecc-badge ${state.ocppConnected ? 'ecc-badge-ok' : 'ecc-badge-off'}`}>
              {state.ocppConnected ? '● VERBONDEN' : 'OFFLINE'}
            </div>
          </div>
          <div className="ecc-card" style={{ margin: 0, padding: 16 }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--ecc-text2)', letterSpacing: '1.5px', marginBottom: 8 }}>GSM SIGNAAL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="ecc-signal-bars">
                {[4, 7, 10, 13, 16].map((h, i) => (
                  <div key={i} className={`ecc-signal-bar ${i < activeCount ? 'active' : ''}`} style={{ height: h }} />
                ))}
              </div>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: 'var(--ecc-text3)' }}>{sig} dBm</span>
            </div>
          </div>
          <div className="ecc-card" style={{ margin: 0, padding: 16 }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--ecc-text2)', letterSpacing: '1.5px', marginBottom: 8 }}>IP ADRES</div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: 'var(--ecc-text3)' }}>{state.connected ? state.gsm.ip : '—'}</div>
          </div>
        </div>

        {/* Connectors */}
        <div className="ecc-connector-grid">
          {state.connectors.map((c) => {
            const badge = getConnectorBadge(c.status);
            return (
              <div key={c.id} className={`ecc-connector-card ${c.status.toLowerCase()}`}>
                <div className="ecc-connector-header">
                  <div>
                    <div className="ecc-connector-label">Laadpunt</div>
                    <div className="ecc-connector-name">Connector {c.id}</div>
                  </div>
                  <div className={`ecc-badge ${badge.cls}`}>{badge.text}</div>
                </div>
                <div className="ecc-stat-row">
                  <span className="ecc-stat-label">CP Status</span>
                  <span className="ecc-stat-val">{c.cpState || '—'}</span>
                </div>
                <div className="ecc-stat-row">
                  <span className="ecc-stat-label">Stroom Limiet</span>
                  <span className="ecc-stat-val">{c.current} A</span>
                </div>
                <div className="ecc-stat-row">
                  <span className="ecc-stat-label">Energie</span>
                  <span className="ecc-stat-val">{c.energy.toFixed(2)} kWh</span>
                </div>
                <div className="ecc-stat-row">
                  <span className="ecc-stat-label">OCPP Status</span>
                  <span className="ecc-stat-val">{c.status}{c.errorCode ? ` (${c.errorCode})` : ''}</span>
                </div>
                <div className="ecc-stat-row">
                  <span className="ecc-stat-label">Fase Rotatie</span>
                  <span className="ecc-stat-val">L1-L2-L3</span>
                </div>
                <div className="ecc-connector-num">{c.id}</div>
              </div>
            );
          })}
        </div>

        {/* Events log */}
        <div className="ecc-card">
          <div className="ecc-card-title">Recente Events</div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, maxHeight: 200, overflowY: 'auto' }}>
            {state.connected ? EVENTS.map((e, i) => (
              <div key={i} className="ecc-log-line" style={{ padding: '3px 0' }}>
                <span className="ecc-log-time">{e.t}</span>
                <span className={`ecc-log-msg ${e.cls}`}>{e.msg}</span>
              </div>
            )) : (
              <div style={{ color: 'var(--ecc-text2)' }}>Geen events — verbind met laadpaal.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ECCDashboard;
