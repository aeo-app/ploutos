import React from 'react';
import { useAuth } from '../../context/AuthContext';
import s from './AdminShell.module.css';

const ADMIN_NAV = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'calendars', label: '📅 Social Media Calendars' },
  { id: 'blogs',     label: '📝 Blogs' },
];

/**
 * Completely separate from AppShell/Sidebar (the regular user layout) — a
 * top nav bar instead of a sidebar, a distinct dark header, and no shared
 * navigation items with the normal user experience. Admins land here by
 * default (see App.js's Root()); "Exit to my account" switches to the
 * regular AppShell if they need to use the tools for their own company.
 */
export function AdminShell({ page, onNavigate, onExitToUserView, children }) {
  const { logout } = useAuth();

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.brand}>
            🛠️ AEO Admin
            <span className={s.brandBadge}>Admin</span>
          </div>
          <nav className={s.nav}>
            {ADMIN_NAV.map(item => (
              <button
                key={item.id}
                type="button"
                className={`${s.navItem} ${page === item.id ? s.navItemActive : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className={s.headerRight}>
          <button type="button" className={s.exitBtn} onClick={onExitToUserView}>
            ← Exit to my account
          </button>
          <button type="button" className={s.signOutBtn} onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className={s.content}>{children}</main>
    </div>
  );
}
