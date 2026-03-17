import { useState } from 'react';
import type { ECCState } from './ecc-types';

interface Props {
  state: ECCState;
  onConnect: () => void;
  onDisconnect: () => void;
  addToast: (msg: string, type?: string) => void;
}

const ECCConnection = ({ state, onConnect, onDisconnect, addToast }: Props) => {
  const [comPort, setComPort] = useState('COM3');
  const [baudrate, setBaudrate] = useState('115200');
  const [databits, setDatabits] = useState('8');
  const [parity, setParity] = useState('none');
  const [stopbits, setStopbits] = useState('1');
  const [cfgFile, setCfgFile] = useState('configuration/production.json');
  const [debugMode, setDebugMode] = useState('1');
  const [replyMsg, setReplyMsg] = useState('0');

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>TTL</span> Verbinding</div>
          <div className="ecc-page-sub">Seriële verbinding naar LMS EVC4 / EVC2.2 laadpaal</div>
        </div>
      </div>
      <div className="ecc-content-area">
        <div className="ecc-card">
          <div className="ecc-card-title">Poort Instellingen</div>
          <div className="ecc-form-row">
            <div className="ecc-form-group">
              <label>COM Poort</label>
              <select className="ecc-select" value={comPort} onChange={e => setComPort(e.target.value)}>
                {['COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','/dev/ttyUSB0','/dev/ttyUSB1','/dev/ttyACM0'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Baudrate</label>
              <select className="ecc-select" value={baudrate} onChange={e => setBaudrate(e.target.value)}>
                {['9600','19200','38400','57600','115200'].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Data Bits</label>
              <select className="ecc-select" value={databits} onChange={e => setDatabits(e.target.value)}>
                <option value="8">8</option>
                <option value="7">7</option>
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Pariteit</label>
              <select className="ecc-select" value={parity} onChange={e => setParity(e.target.value)}>
                <option value="none">Geen</option>
                <option value="even">Even</option>
                <option value="odd">Oneven</option>
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Stop Bits</label>
              <select className="ecc-select" value={stopbits} onChange={e => setStopbits(e.target.value)}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
          </div>
          <div className="ecc-btn-row">
            <button className="ecc-btn ecc-btn-primary" onClick={onConnect} disabled={state.connected}>⚡ Verbinden</button>
            <button className="ecc-btn ecc-btn-danger" onClick={onDisconnect} disabled={!state.connected}>✕ Verbreken</button>
            <button className="ecc-btn ecc-btn-outline" onClick={() => addToast('Poorten vernieuwd', 'info')} style={{ marginLeft: 'auto' }}>↻ Poorten Vernieuwen</button>
          </div>
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">Apparaat Info</div>
          {!state.connected ? (
            <div style={{ color: 'var(--ecc-text2)', fontSize: 12 }}>Verbind met de laadpaal om apparaatinformatie te lezen.</div>
          ) : (
            <div className="ecc-grid-3">
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>OCPP ID</div><div className="ecc-stat-val">{state.device.id}</div></div>
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Serienummer</div><div className="ecc-stat-val">{state.device.serial}</div></div>
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Model</div><div className="ecc-stat-val">{state.device.vendor} {state.device.model}</div></div>
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Firmware</div><div className="ecc-stat-val">{state.device.fw}</div></div>
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Hardware</div><div className="ecc-stat-val">HW{state.device.hw}</div></div>
              <div><div className="ecc-stat-label" style={{ marginBottom: 4, color: 'var(--ecc-text2)', fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Protocol</div><div className="ecc-stat-val">OCPP 1.6</div></div>
            </div>
          )}
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">Configuratie Bestand</div>
          <div className="ecc-form-row">
            <div className="ecc-form-group" style={{ gridColumn: '1/-1' }}>
              <label>Standaard Configuratie (JSON)</label>
              <input className="ecc-input" type="text" value={cfgFile} onChange={e => setCfgFile(e.target.value)} placeholder="Pad naar configuratiebestand" />
            </div>
          </div>
          <div className="ecc-form-row">
            <div className="ecc-form-group">
              <label>Debug Modus</label>
              <select className="ecc-select" value={debugMode} onChange={e => setDebugMode(e.target.value)}>
                <option value="0">Uit</option>
                <option value="1">Aan</option>
                <option value="2">Uitgebreid</option>
              </select>
            </div>
            <div className="ecc-form-group">
              <label>Reply Messages</label>
              <select className="ecc-select" value={replyMsg} onChange={e => setReplyMsg(e.target.value)}>
                <option value="0">Nee</option>
                <option value="1">Ja</option>
              </select>
            </div>
          </div>
          <div className="ecc-btn-row">
            <button className="ecc-btn ecc-btn-outline" onClick={() => addToast('Configuratiebestand geladen', 'ok')}>📂 Configuratie Laden</button>
            <button className="ecc-btn ecc-btn-success" onClick={() => addToast('Instellingen opgeslagen', 'ok')}>💾 Configuratie Opslaan</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ECCConnection;
