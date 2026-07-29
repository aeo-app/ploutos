import React, { useState } from 'react';
import { useApp }  from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button }  from '../ui/Button';
import s from './TopBar.module.css';

const META = {
  home:     { title: 'Dashboard',           sub: 'AI-powered SEO intelligence for Asia-Pacific' },
  compete:  { title: 'Competitor Analysis', sub: 'Visibility scores, DA estimates & keyword rankings' },
  keywords: { title: 'Keyword Intelligence', sub: 'Volume, intent, competition & position data' },
  profile:  { title: 'Company Profile',     sub: 'LinkedIn & Google Business ready-to-use copy' },
  da:       { title: 'Domain Authority',    sub: 'Gap analysis, backlink strategy & 12-month roadmap' },
  report:   { title: 'Full SEO Report',     sub: 'All four analyses in one consolidated view' },
};

export function TopBar({ onMenu }) {
  const { state, clearAll, setPage } = useApp();
  const { auth, logout }             = useAuth();
  const [menuOpen, setMenuOpen]      = useState(false);

  const m      = META[state.page] || META.home;
  const hasAny = Object.values(state.results).some(Boolean);
  const user   = auth.user;

  // First letter of name or email for avatar
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <header className={s.topbar}>
      <button className={s.menuBtn} onClick={onMenu} aria-label="Toggle menu">☰</button>

      <div className={s.titles}>
        <div className={s.pageTitle}>{m.title}</div>
        <div className={s.pageSub}>{m.sub}</div>
      </div>

      <div className={s.actions}>
        {hasAny && (
          <Button variant="ghost" size="sm" onClick={() => { clearAll(); setPage('home'); }}>
            ↺ New Analysis
          </Button>
        )}

        {/* User avatar + dropdown */}
        <div className={s.userArea}>
          <button
            className={s.avatarBtn}
            onClick={() => setMenuOpen(v => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            title={user?.email || ''}
          >
            <div className={s.avatar}>{initials}</div>
            {user?.name && <span className={s.userName}>{user.name.split(' ')[0]}</span>}
            <span className={s.chevron} style={{ transform: menuOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>

          {menuOpen && (
            <>
              <div className={s.dropdownOverlay} onClick={() => setMenuOpen(false)} />
              <div className={s.dropdown}>
                <div className={s.dropdownUser}>
                  <div className={s.dropdownAvatar}>{initials}</div>
                  <div>
                    {user?.name  && <div className={s.dropdownName}>{user.name}</div>}
                    {user?.email && <div className={s.dropdownEmail}>{user.email}</div>}
                  </div>
                </div>
                <div className={s.dropdownDivider} />
                <button
                  className={s.dropdownItem}
                  onClick={() => { setMenuOpen(false); logout(); }}
                >
                  <span>↩</span> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
