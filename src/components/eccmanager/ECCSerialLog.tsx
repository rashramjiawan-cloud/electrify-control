import { useState, useRef, useEffect } from 'react';
import type { ECCLogEntry } from './ecc-types';

interface Props {
  logs: ECCLogEntry[];
  onClear: () => void;
}

const ECCSerialLog = ({ logs, onClear }: Props) => {
  const [autoscroll, setAutoscroll] = useState(true);
  const [textFilter, setTextFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoscroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoscroll]);

  const filtered = logs.filter(e => {
    const matchQ = !textFilter || e.msg.toLowerCase().includes(textFilter.toLowerCase());
    const matchT = typeFilter === 'all' || e.type === typeFilter;
    return matchQ && matchT;
  });

  const handleExport = () => {
    const txt = logs.map(e => `${e.time}\t${e.msg}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = 'serial_log.txt';
    a.click();
  };

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Serieel</span> Log</div>
          <div className="ecc-page-sub">Raw TTL output van de laadpaal</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ecc-text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoscroll} onChange={e => setAutoscroll(e.target.checked)} style={{ width: 'auto' }} />
            Auto-scroll
          </label>
          <button className="ecc-btn ecc-btn-outline" onClick={onClear} style={{ fontSize: 12 }}>🗑 Wissen</button>
          <button className="ecc-btn ecc-btn-outline" onClick={handleExport} style={{ fontSize: 12 }}>⬇ Export</button>
        </div>
      </div>
      <div style={{ padding: '20px 28px 0' }}>
        <div className="ecc-form-row" style={{ marginBottom: 12 }}>
          <div className="ecc-form-group">
            <label>Filter</label>
            <input className="ecc-input" type="text" placeholder="Zoeken in log..." value={textFilter} onChange={e => setTextFilter(e.target.value)} />
          </div>
          <div className="ecc-form-group">
            <label>Type</label>
            <select className="ecc-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">Alle</option>
              <option value="ocpp">OCPP</option>
              <option value="gsm">GSM</option>
              <option value="error">Errors</option>
              <option value="warn">Waarschuwingen</option>
            </select>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 28px 28px' }}>
        <div className="ecc-terminal" ref={logRef} style={{ height: 'calc(100vh - 280px)' }}>
          {filtered.map(log => (
            <div key={log.id} className="ecc-log-line">
              <span className="ecc-log-time">{log.time}</span>
              <span className={`ecc-log-msg ${log.type}`}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default ECCSerialLog;
