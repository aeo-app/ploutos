import React, { useState } from 'react';
import { useApp }  from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useAeo } from '../../aeo/AeoContext';

const META = {
  home:           ['Dashboard', 'How AI answer engines see your business'],
  aeoPrompts:     ['Prompts', 'What people ask AI about your business'],
  aeoCompetitors: ['Competitors', 'Who AI engines recommend in your category'],
  aeoEngines:     ['AI Engines', 'Your visibility in each answer engine'],
  da:             ['Domain Authority', 'Gap analysis and backlink roadmap'],
  profile:        ['Company Profile', 'Your website and business details, as AI engines should see them'],
  aeoStrategy:    ['Content Strategy', 'Strategy, blogs and social posts for your selected prompts'],
  aeoBlogs:       ['Blog Topics', 'Blogs written to win your selected prompts'],
  aeoCalendar:    ['Social Media Calendar', 'A month of posters and reels for every channel, week by week'],
  compete:        ['Competitor Analysis', 'Visibility scores, DA estimates & keyword rankings'],
  keywords:       ['Keyword Intelligence', 'Volume, intent, competition & position data'],
  contentStrategy:['Keyword Content Strategy', 'Competitor-informed, SEO-optimised content per keyword'],
  articleGenerator:['Article Generator', 'Generate a full article for a keyword'],
  blogs:          ['Blogs', 'Your published and draft blogs'],
  blogTopics:     ['Team Blog Topics', 'Topics prepared for you by the AEO-APP team'],
  publishCalendar:['Publishing & Canva', 'Generate posters, connect accounts and schedule posts'],
  relocationCalendar: ['Publishing & Canva', 'Generate posters, connect accounts and schedule posts'],
  report:         ['Full SEO Report', 'All four analyses in one consolidated view'],
  history:        ['History', 'Everything you have generated'],
  billing:        ['Billing & Plans', 'Your plan, usage and invoices'],
};
const RERUN_PAGES = new Set(['home', 'aeoPrompts', 'aeoCompetitors', 'aeoEngines']);

export function TopBar({ onMenu, onEnterAdminView }) {
  const { state } = useApp();
  const { auth, logout } = useAuth();
  const { runAnalysis, loading } = useAeo();
  const [menuOpen, setMenuOpen] = useState(false);

  const [title, sub] = META[state.page] || META.home;
  const user = auth.user;
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <header className="ae-head">
      <div className="ae-head-l">
        <button className="ae-menu" onClick={onMenu} aria-label="Toggle menu">☰</button>
        <div className="ae-head-t"><h1>{title}</h1><span className="ae-head-sub">{sub}</span></div>
      </div>
      <div className="ae-head-r">
        {state.isAdmin && onEnterAdminView && <button className="ae-btn" onClick={onEnterAdminView}>Admin Dashboard</button>}
        <button className="ae-btn" onClick={() => window.print()}>Export PDF</button>
        {RERUN_PAGES.has(state.page) && (
          <button className="ae-btn primary" disabled={loading} onClick={runAnalysis}>{loading ? 'Analysing…' : 'Re-run analysis'}</button>
        )}
        <div className="ae-user">
          <button className="ae-avatar" onClick={() => setMenuOpen(v => !v)} aria-haspopup="true" aria-expanded={menuOpen} title={user?.email || ''}>{initials}</button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setMenuOpen(false)} />
              <div className="ae-drop">
                {user?.name && <div style={{ color: 'var(--ae-text)', fontWeight: 700 }}>{user.name}</div>}
                {user?.email && <div>{user.email}</div>}
                <button onClick={() => { setMenuOpen(false); logout(); }}>↩ Sign out</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
