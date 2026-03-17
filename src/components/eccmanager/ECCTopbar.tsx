import type { ECCState } from './ecc-types';

interface Props {
  state: ECCState;
}

const ECCTopbar = ({ state }: Props) => {
  return (
    <div className="ecc-topbar">
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
