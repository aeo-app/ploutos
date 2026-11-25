import React, { useState, useEffect, useMemo } from 'react';
import { adminApi, adminAeoApi } from '../api/adminApi';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, SectionHeader, Empty, ErrorCard, SkeletonCard, StatTile } from '../components/ui/UI';
import s from './AdminDashboardPage.module.css';

/**
 * The Admin nav's landing page — every registered normal user in one sortable
 * table, with a search box that filters by company name, user name or email.
 * This is read-only navigation: clicking a user hands off to the Calendars
 * or Blogs page (via onSelectUser) rather than editing anything here.
 */
export function AdminDashboardPage({ onSelectUser, onReview }) {
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('all');          // all | paid | free
  const [attention, setAttention] = useState([]);

  useEffect(() => {
    withTokenExpiry(adminApi.listUsers(), authCtx)
      .then(d => setUsers(d?.users || []))
      .catch(e => { if (e?.code !== 'TokenExpired') setError(e.message || 'Could not load users.'); });
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    withTokenExpiry(adminAeoApi.overview(), authCtx)
      .then(d => setAttention((d?.users || []).filter(u => u.blog_requests > 0)))
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    return users.filter(u =>
      (plan === 'all' || (plan === 'paid') === !!u?.is_paid) &&
      (!q ||
        (u?.company_name || '').toLowerCase().includes(q) ||
        (u?.full_name || '').toLowerCase().includes(q) ||
        (u?.email || '').toLowerCase().includes(q))
    );
  }, [users, query, plan]);

  // One table, sortable by clicking a column heading. Company is the default order.
  const [sort, setSort] = useState({ key: 'company', dir: 1 });
  const rows = useMemo(() => {
    const val = {
      company: u => (u?.company_name || '').toLowerCase(),
      name: u => (u?.full_name || u?.email || '').toLowerCase(),
      email: u => (u?.email || '').toLowerCase(),
      site: u => (u?.domain || '').toLowerCase(),
      plan: u => (u?.is_paid ? 0 : 1),
      joined: u => u?.created_at || '',
    }[sort.key];
    return [...filtered].sort((x, y) => {
      const a = val(x), b = val(y);
      // Customers without a company go last when sorting by company.
      if (sort.key === 'company' && (!a || !b) && a !== b) return a ? -1 : 1;
      return (a < b ? -1 : a > b ? 1 : (x?.full_name || '').localeCompare(y?.full_name || '')) * sort.dir;
    });
  }, [filtered, sort]);
  const th = (key, label) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={s.thBtn} onClick={() => setSort(o => ({ key, dir: o.key === key ? -o.dir : 1 }))}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );
  const joinedOf = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };

  const totalUsers = users?.length || 0;
  const totalCompanies = useMemo(() => new Set((users || []).map(u => u?.company_name).filter(Boolean)).size, [users]);
  const totalFree = (users?.length || 0) - (users || []).filter(u => u?.is_paid).length;
  const totalPaid = useMemo(() => (users || []).filter(u => u?.is_paid).length, [users]);

  return (
    <div className={s.page}>
      <SectionHeader title="Admin Dashboard" subtitle="Every registered customer in one table. Click a heading to sort, or a row to review and manage their content." />

      {error && <ErrorCard message={error} />}
      {!users && !error && <SkeletonCard rows={4} />}

      {users && (
        <>
          <div className={s.statsRow}>
            <StatTile icon="🏢" label="Companies" value={totalCompanies} />
            <StatTile icon="👤" label="Registered users" value={totalUsers} />
            <StatTile icon="💳" label="Paid accounts" value={totalPaid} color="var(--c-success)" />
          </div>

          {attention.length > 0 && (
            <Card className={s.companyCard} style={{ marginBottom: 16, borderColor: '#fde68a' }}>
              <div className={s.companyCardHead}>Blog reviews requested by customers</div>
              {attention.map(u => (
                <button key={u.user_id} type="button" className={s.userRow} onClick={() => onReview?.(u)}>
                  <div><div className={s.userName}>{u.company_name || u.email}</div><div className={s.userEmail}>{u.domain}</div></div>
                  <div className={s.userMeta}><Badge variant="warning">{u.blog_requests} to review</Badge></div>
                </button>
              ))}
            </Card>
          )}

          <input
            className={s.searchInput}
            placeholder="Search by company, user name or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <div className={s.planTabs} role="group" aria-label="Filter by plan">
            {[['all', 'All', totalUsers], ['paid', 'Paid', totalPaid], ['free', 'Free', totalFree]].map(([id, label, n]) => (
              <button key={id} type="button" aria-pressed={plan === id} data-testid={`plan-${id}`} className={`${s.planTab} ${plan === id ? s.planTabOn : ''}`} onClick={() => setPlan(id)}>{label} <span>{n}</span></button>
            ))}
          </div>

          {rows.length === 0 ? (
            <Empty icon="🔍" title="No matches" body="No company or user matches that search." />
          ) : (
            <Card className={s.tableCard}>
              <div className={s.tableCount}>{rows.length} of {totalUsers} {totalUsers === 1 ? 'user' : 'users'}</div>
              <div className={s.tableWrap}>
                <table className={s.table} data-testid="users-table">
                  <thead>
                    <tr>{th('company', 'Company')}{th('name', 'User')}{th('email', 'Email')}{th('site', 'Website')}{th('plan', 'Plan')}{th('joined', 'Joined')}<th scope="col" className={s.thPlain}>Role</th><th scope="col" className={s.thPlain}><span className={s.srOnly}>Open</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map(u => (
                      <tr key={u?.user_id} className={s.tr} onClick={() => u?.user_id && onSelectUser?.(u)}>
                        <td className={s.tdStrong}>{u?.company_name || <span className={s.muted}>(no company set)</span>}</td>
                        <td>{u?.full_name || <span className={s.muted}>—</span>}</td>
                        <td className={s.tdEmail}>{u?.email || '—'}</td>
                        <td>{u?.domain || <span className={s.muted}>—</span>}</td>
                        <td><Badge variant={u?.is_paid ? 'success' : 'warning'}>{u?.is_paid ? 'Paid' : 'Free'}</Badge></td>
                        <td className={s.tdNowrap}>{joinedOf(u?.created_at)}</td>
                        <td>{u?.is_admin ? <Badge variant="brand">Admin</Badge> : <span className={s.muted}>User</span>}</td>
                        <td className={s.tdAct}>
                          <button type="button" className={s.openBtn} onClick={e => { e.stopPropagation(); u?.user_id && onSelectUser?.(u); }} aria-label={`Open ${u?.company_name || u?.email || 'user'}`}>Open →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
