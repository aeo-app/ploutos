import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAeoApi } from '../../api/adminApi';
import { withTokenExpiry } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Badge, SkeletonCard } from '../../components/ui/UI';
import s from './AdminAeo.module.css';

/** Calls an admin API with the shared token-expiry handling and an error toast. */
export function useAdminCall() {
  const { goScreen, logout } = useAuth();
  const { toast } = useApp();
  return useCallback(async (promise, { quiet } = {}) => {
    try {
      return await withTokenExpiry(promise, { goScreen, logout });
    } catch (e) {
      if (e?.code !== 'TokenExpired' && !quiet) toast({ type: 'error', message: e?.message || 'Something went wrong.' });
      return null;
    }
  }, [goScreen, logout, toast]);
}

/** Customers with AEO activity, most urgent first, plus a search box. */
export function CustomerList({ selectedUser, onSelectUser, refreshKey }) {
  const call = useAdminCall();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let off = false;
    call(adminAeoApi.overview()).then(d => { if (!off) setRows(d?.users || []); });
    return () => { off = true; };
  }, [call, refreshKey]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter(u => !t || `${u.company_name} ${u.full_name} ${u.email}`.toLowerCase().includes(t));
  }, [rows, q]);
  return (
    <aside className={s.side}>
      <input className={s.search} placeholder="Search customers…" value={q} onChange={e => setQ(e.target.value)} />
      {!rows && <SkeletonCard rows={3} />}
      {shown.map(u => (
        <button key={u.user_id} type="button" className={`${s.cust} ${selectedUser?.user_id === u.user_id ? s.custOn : ''}`} onClick={() => onSelectUser(u)}>
          <span>
            <span className={s.custName}>{u.company_name || u.full_name || u.email}</span><br />
            <span className={s.custSub}>{u.domain || u.email}</span>
          </span>
          <span className={s.badges}>
            {u.blog_requests > 0 && <Badge variant="warning">{u.blog_requests} review{u.blog_requests > 1 ? 's' : ''}</Badge>}
            {u.posts_approved > 0 && <Badge variant="success">{u.posts_approved} approved</Badge>}
            {!u.is_paid && <Badge>Free</Badge>}
          </span>
        </button>
      ))}
      {rows && shown.length === 0 && <span className={s.muted}>No customers found.</span>}
    </aside>
  );
}

/** One customer's saved AEO state + generated content. */
export function useWorkspace(user) {
  const call = useAdminCall();
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!user?.user_id) { setWs(null); return; }
    setLoading(true);
    const d = await call(adminAeoApi.workspace(user.user_id));
    setWs(d);
    setLoading(false);
  }, [user?.user_id, call]);
  useEffect(() => { setWs(null); load(); }, [load]);
  return { ws, setWs, loading, reload: load };
}

/** Prompts worth showing for a customer: the ones they selected, plus any that already have content. */
export function promptsOf(ws) {
  if (!ws) return [];
  const out = [...(ws.state.selected_prompts || [])];
  ws.content.forEach(c => { if (c.prompt && !out.includes(c.prompt)) out.push(c.prompt); });
  return out;
}

/** Shows a stored image even when the bucket isn't public, by asking for a signed link on failure. */
const _cache = {};
export function AdminImg({ userId, src, alt = 'Post image', onLoad, style, className }) {
  const [url, setUrl] = useState(_cache[src] || src);
  const [tried, setTried] = useState(!!_cache[src]);
  const [failed, setFailed] = useState(false);
  const call = useAdminCall();
  useEffect(() => { setUrl(_cache[src] || src); setTried(!!_cache[src]); setFailed(false); }, [src]);
  const onError = async () => {
    if (tried) { setFailed(true); return; }
    setTried(true);
    const r = await call(adminAeoApi.imageUrl(userId, src), { quiet: true });
    if (r?.url) { _cache[src] = r.url; setUrl(r.url); } else setFailed(true);
  };
  if (failed) return <span>Image saved but could not be loaded. <a href={src} target="_blank" rel="noreferrer">Open link</a></span>;
  return <img src={url} alt={alt} onError={onError} onLoad={onLoad} style={style} className={className} />;
}

export function UserHeader({ ws, right }) {
  const u = ws.user;
  return (
    <div className={s.head}>
      <div>
        <h2 className={s.h2}>{u.company_name || u.full_name || u.email}</h2>
        <span className={s.muted}>{u.domain} · {u.email}</span>
      </div>
      <div className={s.actions}>{right}<Badge variant={u.is_paid ? 'success' : 'warning'}>{u.is_paid ? 'Paid' : 'Free'}</Badge></div>
    </div>
  );
}

/** A customer's Short — signed link first so it plays even when the bucket is private. */
export function AdminVideo({ userId, src, thumb }) {
  const [url, setUrl] = useState('');
  const [poster, setPoster] = useState('');
  useEffect(() => {
    let off = false;
    const sign = async (u, set) => {
      if (!u) return;
      try { const r = await adminAeoApi.imageUrl(userId, u); if (!off) set(r?.url || u); } catch { if (!off) set(u); }
    };
    setUrl(''); sign(src, setUrl); sign(thumb, setPoster);
    return () => { off = true; };
  }, [userId, src, thumb]);
  if (!url) return <span className={s.muted}>Loading video…</span>;
  return <video src={url} poster={poster || undefined} controls playsInline preload="metadata" style={{ width: '100%', maxWidth: 320, aspectRatio: '9 / 16', background: '#000', borderRadius: 10 }} />;
}
