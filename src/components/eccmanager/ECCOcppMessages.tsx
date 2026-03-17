import { useState } from 'react';
import type { ECCOcppMessage } from './ecc-types';

interface Props {
  messages: ECCOcppMessage[];
  onClear: () => void;
}

const TABS = [
  { key: 'all', label: 'Alle' },
  { key: 'req', label: 'Requests' },
  { key: 'resp', label: 'Responses' },
  { key: 'status', label: 'StatusNotification' },
  { key: 'heartbeat', label: 'Heartbeat' },
];

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ECCOcppMessages = ({ messages, onClear }: Props) => {
  const [filter, setFilter] = useState('all');

  const filtered = messages.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'req') return m.type === 'req';
    if (filter === 'resp') return m.type === 'resp';
    if (filter === 'status') return m.action.includes('StatusNotification');
    if (filter === 'heartbeat') return m.action.includes('Heartbeat');
    return true;
  });

  const handleExport = () => {
    const txt = messages.map(m => `[${m.ts}] ${m.dir} ${m.action} #${m.seq}\n${m.payload}`).join('\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = 'ocpp_trace.txt';
    a.click();
  };

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>OCPP</span> Berichten</div>
          <div className="ecc-page-sub">OCPP 1.6 communicatie trace</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="ecc-btn ecc-btn-outline" onClick={onClear} style={{ fontSize: 12 }}>🗑 Wissen</button>
          <button className="ecc-btn ecc-btn-outline" onClick={handleExport} style={{ fontSize: 12 }}>⬇ Export</button>
        </div>
      </div>
      <div className="ecc-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`ecc-tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ecc-content-area" style={{ paddingTop: 20 }}>
        {filtered.map((m, i) => (
          <div key={i} className={`ecc-ocpp-msg ${m.type}`}>
            <div className="ecc-ocpp-meta">
              <span className="direction">{m.dir === 'OUT' ? '↑ UIT' : '↓ IN'}</span>
              <span className="action">{m.action}</span>
              <span className="seq">#{m.seq}</span>
              <span className="ts">{m.ts}</span>
            </div>
            <div className="ecc-ocpp-payload" dangerouslySetInnerHTML={{ __html: escHtml(m.payload) }} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--ecc-text2)', fontSize: 12, textAlign: 'center', padding: 40 }}>
            Geen berichten gevonden.
          </div>
        )}
      </div>
    </>
  );
};

export default ECCOcppMessages;
