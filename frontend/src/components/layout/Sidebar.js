import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAeo } from '../../aeo/AeoContext';
import { fmtDate } from '../../aeo/utils';
import Logo from '../../assets/screens/aeo-icon.png';


export function Sidebar({ open, onClose }) {
  const { state, setPage } = useApp();
  const { analysis, saved, lastRun } = useAeo();
  const r = state.request;
  const da = state.results.domainAuthority || state.results.fullReport?.domain_authority_strategy;

  const nPrompts = (analysis?.prompts?.filter(p => !p.locked).length || 0)
    + saved.custom_prompts.filter(t => !(analysis?.prompts || []).some(p => p.text.toLowerCase() === t.toLowerCase())).length;
  const nComps = (analysis?.competitors?.filter(c => !c.is_you).length || 0)
    + saved.custom_competitors.filter(c => !(analysis?.competitors || []).some(x => x.name.toLowerCase() === c.name.toLowerCase())).length;

  const NAV = [
    { section: 'Overview', items: [{ id: 'home', label: 'Dashboard' }] },
    { section: 'Analytics', items: [
      { id: 'aeoPrompts', label: 'Prompts', meta: nPrompts ? String(nPrompts) : '' },
      { id: 'aeoCompetitors', label: 'Competitors', meta: nComps ? String(nComps) : '' },
      { id: 'aeoEngines', label: 'AI Engines', meta: '4' },
      { id: 'da', label: 'Domain Authority', meta: da?.current_da != null ? String(da.current_da) : '' },
    ] },
    { section: 'Content', items: [
      { id: 'profile', label: 'Company Profile' },
      { id: 'aeoStrategy', label: 'Content Strategy', meta: saved.selected_prompts.length ? String(saved.selected_prompts.length) : '' },
      { id: 'aeoBlogs', label: 'Blog Topics' },
      { id: 'aeoCalendar', label: 'Social Media Calendar' },
    ] },
    { section: 'Account', items: [
      { id: 'history', label: 'History' },
      { id: 'billing', label: 'Billing & Plans' },
    ] },
  ];

  const go = (id) => { setPage(id); onClose?.(); window.scrollTo(0, 0); };
  const last = lastRun ? new Date(lastRun) : null;
  const lastLabel = last && !isNaN(last)
    ? `Last run ${fmtDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}, ${last.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : 'No analysis run yet';
  const domain = String(r.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <>
      <div className={`ae-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`ae-side ${open ? 'open' : ''}`}>
        <div className="ae-brand">
          <div className="ae-brand-mark"><img src={Logo} alt="AEO-APP.ai" /></div> 
          <div><span className="ae-brand-name">AEO-APP.ai</span><span className="ae-brand-sub">Answer Engine Optimisation</span></div>
        </div>

        {r.company_name && (
          <div className="ae-company">
            <small>ANALYSING</small>
            <b>{r.company_name}</b>
            <span>{[domain, r.market].filter(Boolean).join(' · ')}</span>
          </div>
        )}

        <nav className="ae-nav">
          {NAV.map(sec => (
            <React.Fragment key={sec.section}>
              <span className="ae-nav-label">{sec.section}</span>
              {sec.items.map(it => (
                <button key={it.id} type="button" className={`ae-nav-item ${(state.page === it.id || (it.id === 'aeoCalendar' && state.page === 'publishCalendar') || (it.id === 'aeoBlogs' && (state.page === 'blogs' || state.page === 'blogTopics'))) ? 'on' : ''}`} onClick={() => go(it.id)}>
                  {it.label}<span className="ae-nav-meta">{it.meta || ''}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="ae-side-foot"><span className={`ae-dot ${last ? '' : 'idle'}`} />{lastLabel}</div>
      </aside>
    </>
  );
}
