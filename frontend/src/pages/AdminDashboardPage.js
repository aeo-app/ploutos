import React, { useState, useEffect, useMemo } from 'react';
import { adminApi } from '../api/adminApi';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, SectionHeader, Empty, ErrorCard, SkeletonCard, StatTile } from '../components/ui/UI';
import s from './AdminDashboardPage.module.css';

/**
 * The Admin nav's landing page — every registered normal user, grouped by
 * company, with a search box that filters by company name OR user name.
 * This is read-only navigation: clicking a user hands off to the Calendars
 * or Blogs page (via onSelectUser) rather than editing anything here.
 */
export function AdminDashboardPage({ onSelectUser }) {
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    withTokenExpiry(adminApi.listUsers(), authCtx)
      .then(d => setUsers(d?.users || []))
      .catch(e => { if (e?.code !== 'TokenExpired') setError(e.message || 'Could not load users.'); });
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u?.company_name || '').toLowerCase().includes(q) ||
      (u?.full_name || '').toLowerCase().includes(q) ||
      (u?.email || '').toLowerCase().includes(q)
    );
  }, [users, query]);

  const companiesMap = useMemo(() => {
    const map = {};
    filtered.forEach(u => {
      const key = u?.company_name || '(no company set)';
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    return map;
  }, [filtered]);
  const companyNames = Object.keys(companiesMap).sort((a, b) => a.localeCompare(b));

  const totalUsers = users?.length || 0;
  const totalCompanies = useMemo(() => new Set((users || []).map(u => u?.company_name).filter(Boolean)).size, [users]);
  const totalPaid = useMemo(() => (users || []).filter(u => u?.is_paid).length, [users]);

  return (
    <div className={s.page}>
      <SectionHeader title="Admin Dashboard" subtitle="Every registered customer, organized by company. Select one to review or manage their content." />

      {error && <ErrorCard message={error} />}
      {!users && !error && <SkeletonCard rows={4} />}

      {users && (
        <>
          <div className={s.statsRow}>
            <StatTile icon="🏢" label="Companies" value={totalCompanies} />
            <StatTile icon="👤" label="Registered users" value={totalUsers} />
            <StatTile icon="💳" label="Paid accounts" value={totalPaid} color="var(--c-success)" />
          </div>

          <input
            className={s.searchInput}
            placeholder="Search by company name or user name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          {companyNames.length === 0 && (
            <Empty icon="🔍" title="No matches" body="No company or user matches that search." />
          )}

          <div className={s.companyGrid}>
            {companyNames.map(companyName => (
              <Card key={companyName} className={s.companyCard}>
                <div className={s.companyCardHead}>{companyName}</div>
                {companiesMap[companyName]?.map(u => (
                  <button
                    key={u?.user_id}
                    type="button"
                    className={s.userRow}
                    onClick={() => u?.user_id && onSelectUser?.(u)}
                  >
                    <div>
                      <div className={s.userName}>{u?.full_name || u?.email || 'Unknown user'}</div>
                      <div className={s.userEmail}>{u?.email}</div>
                    </div>
                    <div className={s.userMeta}>
                      {u?.is_admin && <Badge variant="brand">Admin</Badge>}
                      <Badge variant={u?.is_paid ? 'success' : 'warning'}>{u?.is_paid ? 'Paid' : 'Free'}</Badge>
                    </div>
                  </button>
                ))}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
