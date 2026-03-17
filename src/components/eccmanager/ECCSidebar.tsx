import { useState } from 'react';
import type { ECCState, ECCPage } from './ecc-types';

interface Props {
  state: ECCState;
  activePage: ECCPage;
  onPageChange: (page: ECCPage) => void;
}

const navSections = [
  {
    label: 'Verbinding',
    items: [
      { page: 'connection' as ECCPage, icon: '⚡', label: 'TTL Verbinding' },
      { page: 'firmware' as ECCPage, icon: '⬆', label: 'Firmware' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { page: 'dashboard' as ECCPage, icon: '◉', label: 'Dashboard' },
      { page: 'ocpp' as ECCPage, icon: '⇄', label: 'OCPP Berichten' },
      { page: 'log' as ECCPage, icon: '≡', label: 'Serieel Log' },
    ],
  },
  {
    label: 'Configuratie',
    items: [
      { page: 'config' as ECCPage, icon: '⚙', label: 'Parameters' },
      { page: 'charging' as ECCPage, icon: '⚡', label: 'Laadprofielen' },
    ],
  },
  {
    label: 'Bediening',
    items: [
      { page: 'remote' as ECCPage, icon: '▶', label: 'Remote Actions' },
    ],
  },
];

const ECCSidebar = ({ state, activePage, onPageChange }: Props) => {
  return (
    <div className="ecc-sidebar">
      {navSections.map((section) => (
        <div key={section.label} className="ecc-sidebar-section">
          <div className="ecc-sidebar-label">{section.label}</div>
          {section.items.map((item) => (
            <button
              key={item.page}
              className={`ecc-nav-item ${activePage === item.page ? 'active' : ''}`}
              onClick={() => onPageChange(item.page)}
            >
              <span className="ecc-icon">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      ))}

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
        {state.connected && (
          <div className="ecc-device-box" style={{ width: '100%' }}>
            <div className="ecc-device-id">{state.device.id}</div>
            <div className="ecc-device-model">{state.device.vendor} {state.device.model}</div>
            <div className="ecc-device-fw">
              <span>FW</span><span>{state.device.fw}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ECCSidebar;
