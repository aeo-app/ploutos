import React, { useEffect } from 'react';
import { Icon } from './Icon';
import { hostOf } from './utils';
import { useApp } from '../context/AppContext';

const STATUS = (c) => ({
  connected: [`Connected as ${c.account}`, '#059669'], connect: ['Not connected', '#6b6a85'], reconnect: ['Reconnect needed', '#b45309'],
  progress: ["In progress · the connection didn't finish", '#4f46e5'],
}[c.key]);

/** The "Manage accounts" popup: every channel in one list, with connect / reconnect / disconnect and what we found on the website. */
export function ManageAccounts({ soc, onClose }) {
  const { state } = useApp();
  const { channels, acting, connecting, connect, disconnect, rescan, detecting, canScan } = soc;
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dv-modal" role="dialog" aria-modal="true" aria-label="Manage accounts" onClick={onClose} data-testid="manage-accounts">
      <div className="dv-modal-card" onClick={e => e.stopPropagation()}>
        <div className="dv-modal-head">
          <div className="dv-row-b"><span className="dv-h2">Manage accounts</span>
            <button type="button" className="dv-x" onClick={onClose} title="Close" aria-label="Close"><Icon name="x" size={16} /></button></div>
          <div className="dv-scan">
            <span>We look for your social pages on {hostOf(state.request.url) || 'your website'}</span>
            <button type="button" className="dv-btn sm" disabled={detecting || !canScan} onClick={rescan}><Icon name="refresh-cw" size={14} />{detecting ? 'Scanning…' : 'Scan website again'}</button>
          </div>
        </div>
        <div className="dv-modal-body">
          {channels.map((c, i) => {
            const [txt, col] = STATUS(c);
            return (
              <div key={c.id} className="dv-mrow" style={{ borderTop: i ? '1px solid #f0f0f6' : 0 }}>
                <div className="dv-ico lg" style={{ background: c.bg, color: c.fg }}><Icon name={c.icon} size={18} /></div>
                <div className="dv-grow"><span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span><span style={{ fontSize: 12, color: col }}>{txt}</span>
                  {c.foundUrl && c.key !== 'connected' && <a href={c.foundUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Found on your website: {c.foundLabel}</a>}</div>
                {!acting && c.key === 'connected' && <button type="button" className="dv-btn danger sm" onClick={() => disconnect(c)}>Disconnect</button>}
                {!acting && c.key === 'connect' && <button type="button" className="dv-btn primary sm" disabled={connecting === c.id} onClick={() => connect(c)}>{connecting === c.id ? 'Opening…' : 'Connect'}</button>}
                {!acting && c.key === 'reconnect' && <button type="button" className="dv-btn warn sm" disabled={connecting === c.id} onClick={() => connect(c)}>Reconnect</button>}
                {!acting && c.key === 'progress' && <button type="button" className="dv-link" disabled={connecting === c.id} onClick={() => connect(c)}>Try again</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
