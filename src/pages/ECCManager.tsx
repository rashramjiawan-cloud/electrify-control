import { useState, useCallback, useRef, useEffect } from 'react';
import type { ECCState, ECCPage, ECCLogEntry } from '../components/eccmanager/ecc-types';
import { DEFAULT_STATE, DEMO_LOG, DEMO_OCPP_MESSAGES, DEMO_CONFIG } from '../components/eccmanager/ecc-demo-data';
import ECCTopbar from '../components/eccmanager/ECCTopbar';
import ECCSidebar from '../components/eccmanager/ECCSidebar';
import ECCConnection from '../components/eccmanager/ECCConnection';
import ECCFirmware from '../components/eccmanager/ECCFirmware';
import ECCDashboard from '../components/eccmanager/ECCDashboard';
import ECCOcppMessages from '../components/eccmanager/ECCOcppMessages';
import ECCSerialLog from '../components/eccmanager/ECCSerialLog';
import ECCConfig from '../components/eccmanager/ECCConfig';
import ECCChargingProfiles from '../components/eccmanager/ECCChargingProfiles';
import ECCRemoteActions from '../components/eccmanager/ECCRemoteActions';
import '../components/eccmanager/ECCManager.css';

interface Toast {
  id: number;
  msg: string;
  type: string;
}

interface Modal {
  title: string;
  body: string;
  onConfirm: () => void;
}

const ECCManager = () => {
  const [state, setState] = useState<ECCState>({ ...DEFAULT_STATE });
  const [activePage, setActivePage] = useState<ECCPage>('connection');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const logCounterRef = useRef(0);
  const streamTimersRef = useRef<NodeJS.Timeout[]>([]);

  // Toast system
  const addToast = useCallback((msg: string, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Modal system
  const showModal = useCallback((title: string, body: string, onConfirm: () => void) => {
    setModal({ title, body, onConfirm });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const confirmModal = useCallback(() => {
    if (modal) {
      modal.onConfirm();
      setModal(null);
    }
  }, [modal]);

  // Log system
  const addLog = useCallback((time: string, msg: string, type: string) => {
    const entry: ECCLogEntry = {
      id: Date.now() + logCounterRef.current++,
      time,
      msg,
      type: type as ECCLogEntry['type'],
    };
    setState(prev => ({
      ...prev,
      logEntries: [...prev.logEntries, entry].slice(-200),
    }));
  }, []);

  // Parse time to ms for demo streaming
  const parseTimeToMs = (t: string) => {
    const parts = t.split(':');
    if (parts.length !== 3) return 0;
    return (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000;
  };

  // Connect (demo mode)
  const handleConnect = useCallback(() => {
    setState(prev => ({ ...prev, connected: true, ocppConnected: true, ocppMessages: DEMO_OCPP_MESSAGES, cfgData: [...DEMO_CONFIG] }));
    addToast('Demo modus — simulatie actief', 'warn');

    // Stream demo log with realistic delays
    const base = DEMO_LOG[0] ? parseTimeToMs(DEMO_LOG[0].time) : 0;
    const timers: NodeJS.Timeout[] = [];
    DEMO_LOG.forEach((e, i) => {
      const ms = Math.max(i * 80, parseTimeToMs(e.time) - base);
      const timer = setTimeout(() => {
        addLog(e.time, e.msg, e.type);
      }, ms);
      timers.push(timer);
    });
    streamTimersRef.current = timers;
  }, [addToast, addLog]);

  const handleDisconnect = useCallback(() => {
    streamTimersRef.current.forEach(t => clearTimeout(t));
    streamTimersRef.current = [];
    setState(prev => ({ ...prev, connected: false, ocppConnected: false, logEntries: [] }));
    addToast('Verbinding verbroken', 'warn');
  }, [addToast]);

  // Config change
  const handleCfgChange = useCallback((index: number, value: string) => {
    setState(prev => {
      const newCfg = [...prev.cfgData];
      newCfg[index] = { ...newCfg[index], value };
      return { ...prev, cfgData: newCfg };
    });
  }, []);

  // OCPP clear
  const handleClearOcpp = useCallback(() => {
    setState(prev => ({ ...prev, ocppMessages: [] }));
  }, []);

  // Log clear
  const handleClearLog = useCallback(() => {
    setState(prev => ({ ...prev, logEntries: [] }));
  }, []);

  // Heartbeat simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.connected && state.ocppConnected && Math.random() < 0.03) {
        const t = new Date().toTimeString().slice(0, 8);
        addLog(t, `[2,"${Math.floor(Math.random() * 99999)}","Heartbeat",{}]`, 'ocpp');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state.connected, state.ocppConnected, addLog]);

  const renderPage = () => {
    switch (activePage) {
      case 'connection':
        return <ECCConnection state={state} onConnect={handleConnect} onDisconnect={handleDisconnect} addToast={addToast} />;
      case 'firmware':
        return <ECCFirmware state={state} addToast={addToast} addLog={addLog} />;
      case 'dashboard':
        return <ECCDashboard state={state} />;
      case 'ocpp':
        return <ECCOcppMessages messages={state.ocppMessages} onClear={handleClearOcpp} />;
      case 'log':
        return <ECCSerialLog logs={state.logEntries} onClear={handleClearLog} />;
      case 'config':
        return <ECCConfig cfgData={state.cfgData} onCfgChange={handleCfgChange} addToast={addToast} addLog={addLog} connected={state.connected} />;
      case 'charging':
        return <ECCChargingProfiles connected={state.connected} addToast={addToast} addLog={addLog} />;
      case 'remote':
        return <ECCRemoteActions connected={state.connected} addToast={addToast} addLog={addLog} showModal={showModal} />;
    }
  };

  return (
    <div className="ecc-root">
      <ECCTopbar state={state} />
      <div className="ecc-layout">
        <ECCSidebar state={state} activePage={activePage} onPageChange={setActivePage} />
        <div className="ecc-main">
          {renderPage()}
        </div>
      </div>

      {/* Toast container */}
      <div className="ecc-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`ecc-toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <div className="ecc-modal-overlay">
          <div className="ecc-modal">
            <div className="ecc-modal-title">{modal.title}</div>
            <div style={{ color: 'var(--ecc-text3)', fontSize: 13 }}>{modal.body}</div>
            <div className="ecc-modal-btns">
              <button className="ecc-btn ecc-btn-outline" onClick={closeModal}>Annuleren</button>
              <button className="ecc-btn ecc-btn-primary" onClick={confirmModal}>Bevestigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ECCManager;
