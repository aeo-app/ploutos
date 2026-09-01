import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import s from './Sidebar.module.css';

function getNav() {
  const nav = [
    {
      section: 'Overview',
      items: [
        { id: 'home',    icon: '⊞', label: 'Dashboard' },
      ],
    },
    {
      section: 'Analytics',
      items: [
        { id: 'compete',  icon: '⚔',  label: 'Competitors' },
        { id: 'keywords', icon: '🔑', label: 'Keywords' },
        { id: 'da',       icon: '📈', label: 'Domain Authority' },
      ],
    },
    {
      section: 'Content',
      items: [
        { id: 'profile',  icon: '📋', label: 'Company Profile' },
        { id: 'contentStrategy', icon: '✍️', label: 'Content Strategy' },
        { id: 'blogTopics', icon: '📝', label: 'Blog Topics' },
        { id: 'articleGenerator', icon: '📰', label: 'Article Generator' },
        { id: 'relocationCalendar', icon: '📅', label: 'Social Media Calendar' },
      ],
    },
    {
      section: 'Reports',
      items: [
        { id: 'report',   icon: '⚡',  label: 'Full Report' },
      ],
    },
    {
      section: 'Account',
      items: [
        { id: 'history', icon: '🗂️', label: 'History' },
        // Previously hidden for admin accounts entirely, on the reasoning
        // that admins bypass payment (is_user_paid()'s admin check) so
        // billing is "meaningless" for them. But this component only ever
        // renders inside AppShell — which is exactly what an admin sees
        // AFTER clicking "Exit to my account" in the separate admin
        // dashboard (see AdminShell.js/AdminApp.js, which have their own
        // completely separate navigation and never touch this file at
        // all). Hiding it based on account-level admin status, rather than
        // "is the admin dashboard currently showing", meant an admin could
        // never see their own billing screen even when deliberately
        // viewing their own account, not the admin view.
        { id: 'billing', icon: '💳', label: 'Billing & Plans' },
      ],
    },
  ];
  // No "Admin" item here anymore — the admin dashboard is a completely
  // separate shell (see pages/AdminApp.js), not a page within this regular
  // sidebar. Admins reach it via a small link in TopBar instead (see
  // components/layout/TopBar.js), which keeps this nav identical for every
  // account type rather than conditionally shared.
  return nav;
}

function SearchIcon() {
  return (
    <svg className={s.logoMarkSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

export function Sidebar({ open, onClose }) {
  const { state, setPage, clearAll } = useApp();
  const hasAny = Object.values(state.results).some(Boolean);
  const NAV = getNav();

  const go = (id) => { setPage(id); onClose?.(); };

  return (
    <>
      <div className={`${s.overlay} ${open ? s.overlayVisible : ''}`} onClick={onClose} />
      <aside className={`${s.sidebar} ${open ? s.sidebarOpen : ''}`}>
        {/* Logo */}
        <div className={s.logo}>
          <div className={s.logoMark}><SearchIcon /></div>
          <div>
            <div className={s.logoText}>AEO<span style={{ color: 'var(--c-indigo-600)' }}>Intel</span></div>
            <div className={s.logoSub}>SEO Intelligence Platform</div>
          </div>
        </div>

        {/* Active company */}
        <AnimatePresence>
          {state.request.company_name && (
            <motion.div
              className={s.companyBadge}
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
            >
              <div className={s.companyBadgeLabel}>Analysing</div>
              <div className={s.companyBadgeName}>{state.request.company_name}</div>
              <div className={s.companyBadgeSub}>{state.request.market}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav */}
        <nav className={s.nav}>
          {NAV.map(section => (
            <div key={section.section} className={s.navSection}>
              <div className={s.navSectionLabel}>{section.section}</div>
              {section.items.map(item => {
                const active = state.page === item.id;
                const hasResult = item.id === 'compete' ? !!state.results.competitors || !!state.results.fullReport
                  : item.id === 'da'      ? !!state.results.domainAuthority || !!state.results.fullReport
                  : item.id === 'report'  ? !!state.results.fullReport
                  : item.id === 'contentStrategy' ? !!state.results.contentStrategy
                  : item.id === 'relocationCalendar' ? !!state.results.relocationCalendar
                  : item.id === 'history' ? false
                  : item.id === 'billing' ? false
                  : item.id === 'admin' ? false
                  : item.id === 'blogTopics' ? false
                  : item.id === 'articleGenerator' ? false
                  : !!state.results[item.id] || !!state.results.fullReport;
                return (
                  <button
                    key={item.id}
                    className={`${s.navItem} ${active ? s.navItemActive : ''}`}
                    onClick={() => go(item.id)}
                  >
                    <span className={s.navIcon}>{item.icon}</span>
                    {item.label}
                    {hasResult && item.id !== 'home' && (
                      <span className={`${s.navPill} ${s.navPillSuccess}`}>✓</span>
                    )}
                    {active && <span className={s.activeBar} />}
                  </button>
                );
              })}
            </div>
          ))}
          {hasAny && (
            <button className={s.navItem} onClick={() => { clearAll(); setPage('home'); onClose?.(); }}>
              <span className={s.navIcon}>↺</span>
              New Analysis
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className={s.footer}>
          <div className={s.footerBadge}>
            <span className={s.footerDot} />
            <span>Powered by <strong>Claude AI</strong></span>
          </div>
        </div>
      </aside>
    </>
  );
}
