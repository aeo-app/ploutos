import React, { useEffect, useState } from 'react';
import { BASE, getAuthHeaders } from '../../api/seoApi';
import { Badge, Empty, SectionHeader, SkeletonCard } from '../../components/ui/UI';
import { AdminErrorBoundary } from '../../components/AdminErrorBoundary';
import { CustomerApp } from './CustomerView';
import { CustomerList, useWorkspace } from './shared';
import s from './AdminAeo.module.css';

const STRIP = 48;   // height of the customer switcher bar
const HEADER = 64;  // height of the admin header above it

/** The bar that stays on top of the customer's app: who you are acting as, and a way to switch or leave. */
function SwitchStrip({ user, selectedUser, onSelectUser }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'sticky', top: HEADER, zIndex: 60, height: STRIP, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: '#312e81', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
      <span style={{ fontSize: 12, opacity: .8 }}>Viewing as</span>
      <strong data-testid="acting-as" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.company_name || user.full_name || user.email}</strong>
      <span style={{ fontSize: 12, opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
      <Badge variant={user.is_paid ? 'success' : 'warning'}>{user.is_paid ? 'Paid' : 'Free'}</Badge>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,.5)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Switch customer ▾
      </button>
      <button type="button" onClick={() => onSelectUser(null)}
        style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fff', color: '#312e81', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Exit customer view
      </button>
      {open && (
        <div style={{ position: 'absolute', top: STRIP, right: 16, width: 340, maxHeight: '70vh', overflow: 'auto', background: '#fff', color: '#0f172a', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.25)', padding: 10 }}>
          <CustomerList selectedUser={selectedUser} onSelectUser={(u) => { setOpen(false); onSelectUser(u); }} />
        </div>
      )}
    </div>
  );
}

/**
 * Admin "customer view": pick a customer and their real app (sidebar, top bar, every page) opens, running
 * as that customer. Switching customers remounts everything, so nothing from the previous one survives.
 */
/** Before showing a customer's app, ask the server whose data it will really use. Showing the admin's own data
 *  under a customer's name would be worse than showing nothing. */
function useActingCheck(uid) {
  const [res, setRes] = useState({ uid: null, ok: null });
  useEffect(() => {
    if (!uid) return undefined;
    let off = false;
    (async () => {
      try {
        const r = await fetch(`${BASE}/aeo/whoami?act_as=${encodeURIComponent(uid)}`, { headers: { ...getAuthHeaders(), 'X-Act-As-User': uid }, cache: 'no-store' });
        const d = await r.json().catch(() => ({}));
        if (!off) setRes({ uid, ok: r.ok && d.working_on === uid, status: r.status, got: d.working_on, detail: d.detail });
      } catch (e) { if (!off) setRes({ uid, ok: false, status: 0, detail: e.message }); }
    })();
    return () => { off = true; };
  }, [uid]);
  return res.uid === uid ? res : { uid, ok: null };
}

export function AdminAeoAnalysisPage({ selectedUser, onSelectUser }) {
  const { ws, loading } = useWorkspace(selectedUser);
  const check = useActingCheck(selectedUser?.user_id);

  if (!selectedUser) {
    return (
      <div>
        <SectionHeader title="Customer view" subtitle="Pick a customer to open their app exactly as they see it, with every feature. Everything you do is saved on their account." />
        <div className={s.layout}>
          <CustomerList selectedUser={selectedUser} onSelectUser={onSelectUser} />
          <div className={s.main}><Empty icon="👤" title="Choose a customer" body="Their full app opens here: sidebar, dashboard, prompts, analysis, calendar, blogs and the rest." /></div>
        </div>
      </div>
    );
  }

  const uid = selectedUser.user_id;
  return (
    <div style={{ '--app-top': `${HEADER + STRIP}px` }}>
      <SwitchStrip user={ws?.user || selectedUser} selectedUser={selectedUser} onSelectUser={onSelectUser} />
      {(loading || !ws || check.ok === null) && <div style={{ padding: 24 }}><SkeletonCard rows={4} /></div>}
      {check.ok === false && (
        <div style={{ padding: 24, maxWidth: 760 }}>
          <Empty icon="⚠️" title="The server is not answering as this customer"
            body={check.status === 404
              ? 'Your backend does not have the customer-view update yet (the /aeo/whoami check was not found). Deploy the latest backend, then reload.'
              : check.status === 403
                ? 'This account is not recognised as an admin by the server. Add it to the Cognito "Admins" group (or ADMIN_EMAILS), then sign out and back in.'
                : check.status === 0
                  ? `The request was blocked before it reached the server (${check.detail || 'network error'}). Your gateway or CORS settings must allow the X-Act-As-User header.`
                  : `The server answered as ${check.got || 'someone else'} instead of this customer, so your gateway is probably dropping the X-Act-As-User header and query string. Customer view is turned off so you never see the wrong data.`} />
        </div>
      )}
      {ws && check.ok === true && (
        <AdminErrorBoundary key={uid}>
          <CustomerApp key={uid} ws={ws} />
        </AdminErrorBoundary>
      )}
    </div>
  );
}
