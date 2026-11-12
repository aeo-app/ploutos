import React, { useState } from 'react';
import { useApp }  from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useViewAs } from '../../context/ViewAsContext';
import { useAeo } from '../../aeo/AeoContext';
import { Icon } from '../../aeo/Icon';
import { fmtDate } from '../../aeo/utils';

const META = {
  home:           ['Dashboard', 'How AI answer engines see your business'],
  aeoPrompts:     ['Prompts', 'What people ask AI about your business'],
  aeoCompetitors: ['Competitors', 'Who AI engines recommend in your category'],
  aeoEngines:     ['AI Engines', 'Your visibility in each answer engine'],
  da:             ['Domain Authority', 'Gap analysis and backlink roadmap'],
  insights:       ['Insights', 'Real measurements of your website, from Google'],
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
  const { runAnalysis, loading, quota, analysis, lastRun } = useAeo();
  const locked = !!quota && quota.can_run === false;
  const lockedUntil = locked && quota.next_available ? new Date(quota.next_available).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  const [menuOpen, setMenuOpen] = useState(false);

  const [title, sub] = META[state.page] || META.home;
  const viewAs = useViewAs();               // admin inside a customer's app: show the customer, not the admin
  const user = viewAs || auth.user;
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  const avatar = (
    <div className="ae-user">
      <button className="ae-avatar" onClick={() => setMenuOpen(v => !v)} aria-haspopup="true" aria-expanded={menuOpen} title={user?.email || ''}>{initials}</button>
      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setMenuOpen(false)} />
          <div className="ae-drop">
            {user?.name && <div style={{ color: 'var(--ae-text)', fontWeight: 700 }}>{user.name}</div>}
            {user?.email && <div>{user.email}</div>}
            {viewAs
              ? <div style={{ fontSize: 12, marginTop: 6 }}>Admin view of this customer</div>
              : <button onClick={() => { setMenuOpen(false); logout(); }}>↩ Sign out</button>}
          </div>
        </>
      )}
    </div>
  );

  if (state.page === 'home') {
    const day = (d) => fmtDate(d, { day: 'numeric', month: 'short' });
    const last = lastRun ? new Date(lastRun) : null;
    const next = quota?.next_available ? new Date(quota.next_available) : (last ? new Date(last.getTime() + (quota?.interval_days || 30) * 864e5) : null);
    const upd = analysis && last && !isNaN(last) ? `Updated ${day(last)}${next && !isNaN(next) ? ` · Next update ${day(next)}` : ''}` : '';
    const canRerun = !!analysis && !!quota && quota.can_run !== false;
    return (
      <header className="ae-head dash" data-testid="dash-head">
        <div className="dv-mbar dv-nopr">
          <button type="button" className="m" onClick={onMenu} aria-label="Open menu" title="Menu"><Icon name="menu" size={22} /></button>
          <span className="t">AEO-APP<span>.ai</span></span>
          <div className="av ae-user-wrap">{avatar}</div>
        </div>
        <div className="ae-head-l">
          <div className="ae-head-t"><h1>Welcome back</h1><span className="ae-head-sub">How {state.request.company_name || 'your business'} shows up in AI search, and what's going out on your social media.</span></div>
        </div>
        <div className="ae-head-r">
          {upd && <span className="dv-upd">{upd}</span>}
          {state.isAdmin && onEnterAdminView && <button className="dv-hbtn dv-nopr" onClick={onEnterAdminView}>Admin Dashboard</button>}
          {canRerun && <button type="button" className="dv-hbtn primary dv-nopr" disabled={loading} onClick={runAnalysis} data-testid="run-new"><Icon name="refresh-cw" size={15} />{loading ? 'Analysing…' : 'Run new analysis'}</button>}
          {analysis && <button type="button" className="dv-hbtn dv-nopr" onClick={() => window.print()} data-testid="dl-pdf-dash"><Icon name="download" size={15} />Download PDF</button>}
          <span className="dv-nopr dv-av-d">{avatar}</span>
        </div>
      </header>
    );
  }

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
          <button className="ae-btn primary" disabled={loading || locked} title={locked ? `An analysis can be run once every ${quota.interval_days || 30} days.` : undefined} onClick={runAnalysis}>{loading ? 'Analysing…' : locked ? `Next analysis ${lockedUntil}` : 'Re-run analysis'}</button>
        )}
        <div className="ae-user">
          <button className="ae-avatar" onClick={() => setMenuOpen(v => !v)} aria-haspopup="true" aria-expanded={menuOpen} title={user?.email || ''}>{initials}</button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setMenuOpen(false)} />
              <div className="ae-drop">
                {user?.name && <div style={{ color: 'var(--ae-text)', fontWeight: 700 }}>{user.name}</div>}
                {user?.email && <div>{user.email}</div>}
                {viewAs
                  ? <div style={{ fontSize: 12, marginTop: 6 }}>Admin view of this customer</div>
                  : <button onClick={() => { setMenuOpen(false); logout(); }}>↩ Sign out</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
