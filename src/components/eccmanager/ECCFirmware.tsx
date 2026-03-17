import { useState, useRef, useCallback } from 'react';
import type { ECCState } from './ecc-types';

interface Props {
  state: ECCState;
  addToast: (msg: string, type?: string) => void;
  addLog: (time: string, msg: string, type: string) => void;
}

const FW_STEPS = [
  { pct: 5, msg: 'Bootloader activeren...', type: 'info' },
  { pct: 15, msg: 'Firmware handtekening controleren...', type: 'info' },
  { pct: 25, msg: 'Flash geheugen wissen...', type: 'warn' },
  { pct: 40, msg: 'Firmware schrijven (blok 1/4)...', type: 'info' },
  { pct: 55, msg: 'Firmware schrijven (blok 2/4)...', type: 'info' },
  { pct: 70, msg: 'Firmware schrijven (blok 3/4)...', type: 'info' },
  { pct: 85, msg: 'Firmware schrijven (blok 4/4)...', type: 'info' },
  { pct: 95, msg: 'CRC validatie...', type: 'info' },
  { pct: 100, msg: 'PRGCODE CRC VALID — Herstart...', type: 'ok' },
];

const ECCFirmware = ({ state, addToast, addLog }: Props) => {
  const [fwPath, setFwPath] = useState('EVC4V32R16.bin');
  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [fwLogLines, setFwLogLines] = useState<{time: string; msg: string; type: string}[]>([
    { time: '--:--:--', msg: 'Klaar voor firmware update. Verbind eerst via TTL.', type: 'info' },
  ]);
  const fwLogRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const now = () => new Date().toTimeString().slice(0, 8);

  const startFlash = useCallback(() => {
    if (!state.connected) {
      addToast('Verbind eerst met de laadpaal!', 'error');
      return;
    }
    setFlashing(true);
    setProgress(0);
    setFwLogLines([]);

    let step = 0;
    intervalRef.current = setInterval(() => {
      if (step < FW_STEPS.length) {
        const s = FW_STEPS[step];
        setProgress(s.pct);
        setStatusText(s.msg);
        setFwLogLines(prev => [...prev, { time: now(), msg: s.msg, type: s.type }]);
        step++;
        if (fwLogRef.current) fwLogRef.current.scrollTop = fwLogRef.current.scrollHeight;
      } else {
        clearInterval(intervalRef.current!);
        setFlashing(false);
        addToast('Firmware succesvol geüpload!', 'ok');
      }
    }, 600);
  }, [state.connected, addToast]);

  return (
    <>
      <div className="ecc-page-header">
        <div>
          <div className="ecc-page-title"><span>Firmware</span> Update</div>
          <div className="ecc-page-sub">Flash firmware naar LMS EVC4 via TTL bootloader</div>
        </div>
      </div>
      <div className="ecc-content-area">
        <div className="ecc-card">
          <div className="ecc-card-title">Firmware Bestand</div>
          <div className="ecc-form-row">
            <div className="ecc-form-group" style={{ gridColumn: '1/-1' }}>
              <label>Firmware Bestand (.bin)</label>
              <input className="ecc-input" type="text" value={fwPath} onChange={e => setFwPath(e.target.value)} placeholder="Pad naar .bin bestand" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, margin: '16px 0', fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--ecc-text2)', marginBottom: 4 }}>Huidig</div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", color: 'var(--ecc-text3)' }}>{state.device.fw}</div>
            </div>
            <div>
              <div style={{ color: 'var(--ecc-text2)', marginBottom: 4 }}>Beschikbaar</div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", color: 'var(--ecc-accent2)' }}>EVC4V32R16</div>
            </div>
          </div>
          <div className="ecc-btn-row">
            <button className="ecc-btn ecc-btn-warn" onClick={startFlash} disabled={flashing}>⬆ Firmware Flashen</button>
            <button className="ecc-btn ecc-btn-outline" onClick={() => addToast('Firmware versie: ' + state.device.fw, 'info')}>🔍 Controleren</button>
          </div>
          {(flashing || progress > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--ecc-text2)', marginBottom: 6 }}>
                <span>{statusText}</span>
                <span>{progress}%</span>
              </div>
              <div className="ecc-fw-progress">
                <div className="ecc-fw-bar" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="ecc-card">
          <div className="ecc-card-title">Bootloader Log</div>
          <div className="ecc-terminal" ref={fwLogRef}>
            {fwLogLines.map((line, i) => (
              <div key={i} className="ecc-log-line">
                <span className="ecc-log-time">{line.time}</span>
                <span className={`ecc-log-msg ${line.type}`}>{line.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default ECCFirmware;
