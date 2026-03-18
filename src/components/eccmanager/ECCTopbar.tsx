import { useNavigate } from 'react-router-dom';
import type { ECCState } from './ecc-types';

interface Props {
  state: ECCState;
}

const ECCTopbar = ({ state }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="ecc-topbar">
      <button
        className="ecc-btn ecc-btn-outline"
        style={{ padding: '4px 10px', fontSize: 12, marginRight: 8 }}
        onClick={() => navigate('/')}
        title="Terug naar home"
      >
        ← Home
      </button>
      <div className="ecc-logo">VOLT<span>CONTROL</span></div>
      <div className="ecc-logo-divider" />
      <div className="ecc-module-tag">ECC Manager</div>
      <div className="ecc-topbar-right">
        <div className="ecc-conn-indicator">
          <div className={`ecc-dot ${state.connected ? 'connected' : ''}`} />
          <span>{state.connected ? 'VERBONDEN' : 'NIET VERBONDEN'}</span>
        </div>
        <div className="ecc-conn-indicator">
          <div className={`ecc-dot ${state.ocppConnected ? 'connected' : ''}`} />
          <span>{state.ocppConnected ? 'OCPP LIVE' : 'OCPP OFFLINE'}</span>
        </div>
      </div>
    </div>
  );
};

export default ECCTopbar;
