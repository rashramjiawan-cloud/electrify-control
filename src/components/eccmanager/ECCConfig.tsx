import { useState } from 'react';
import type { ECCConfigRow } from './ecc-types';

interface Props {
  cfgData: ECCConfigRow[];
  onCfgChange: (index: number, value: string) => void;
  addToast: (msg: string, type?: string) => void;
  addLog: (time: string, msg: string, type: string) => void;
  connected: boolean;
}

const CFG_TABS = [
  { key: 'all', label: 'Alle' },
  { key: 'gsm', label: 'GSM' },
  { key: 'com', label: 'COM/OCPP' },
  { key: 'chg', label: 'Laden' },
  { key: 'grid', label: 'Grid' },
  { key: 'eth', label: 'Ethernet' },
];

const ECCConfig = ({ cfgData, onCfgChange, addToast, addLog, connected }: Props) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const now = () => new Date().toTimeString().slice(0, 8);

  const filtered = cfgData.filter(r => {
    const matchFilter = filter === 'all' || r.key.toLowerCase().startsWith(filter);
    const matchSearch = !search || r.key.toLowerCase().includes(search.toLowerCase()) || r.value.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const handleSendKey = (index: number) => {
    const row = cfgData[index];
    addToast(`Schrijf: ${row.key} = ${row.value}`, 'ok');
    addLog(now(), `ChangeConfiguration ${row.key}=${row.value}`, 'ocpp');
  };

  const handleRead = () => {
    addToast('Configuratie gelezen van apparaat', 'ok');
  };

  const handleWrite = () => {
    if (!connected) { addToast('Niet verbonden!', 'error'); return; }
    addToast('Configuratie geschreven naar apparaat', 'ok');
    addLog(now(), 'ChangeConfiguration bulk write', 'ocpp');
  };

  const handleExport = () => {
    const json = JSON.stringify({ configurationKey: cfgData.map(r => ({ key: r.key, readonly: r.readonly, value: r.value })) }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'configuration.json';
    a.click();
  };

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Parameters</span> Configuratie</div>
          <div className="ecc-page-sub">Alle OCPP en apparaat parameters</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="ecc-btn ecc-btn-outline" onClick={handleRead}>📥 Lezen</button>
          <button className="ecc-btn ecc-btn-success" onClick={handleWrite}>📤 Schrijven</button>
          <button className="ecc-btn ecc-btn-outline" onClick={handleExport}>⬇ Export</button>
        </div>
      </div>
      <div className="ecc-tabs">
        {CFG_TABS.map(t => (
          <button key={t.key} className={`ecc-tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '20px 28px 0' }}>
        <input className="ecc-input" type="text" placeholder="Zoeken..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      </div>
      <div style={{ padding: '0 28px 28px', overflowX: 'auto' }}>
        <table className="ecc-cfg-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Waarde</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const realIdx = cfgData.indexOf(row);
              return (
                <tr key={row.key}>
                  <td className="key-col">{row.key}</td>
                  <td className="val-col">
                    {row.readonly ? (
                      <span>{row.value}</span>
                    ) : (
                      <input
                        className="ecc-cfg-edit"
                        value={row.value}
                        onChange={e => onCfgChange(realIdx, e.target.value)}
                      />
                    )}
                  </td>
                  <td><span className="ecc-ro-badge">{row.readonly ? 'R' : 'R/W'}</span></td>
                  <td>
                    {!row.readonly && (
                      <button className="ecc-btn ecc-btn-outline" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => handleSendKey(realIdx)}>
                        Zet
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ECCConfig;
