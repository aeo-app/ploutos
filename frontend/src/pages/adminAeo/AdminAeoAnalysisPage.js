import React, { useState } from 'react';
import { Empty, SectionHeader, SkeletonCard } from '../../components/ui/UI';
import { DashboardPage, PromptsPage, CompetitorsAeoPage, EnginesPage } from '../../aeo/pages/AnalyticsPages';
import { CustomerView } from './CustomerView';
import { CustomerList, UserHeader, useWorkspace } from './shared';
import s from './AdminAeo.module.css';

const TABS = [
  ['dashboard', 'Results'],
  ['prompts', 'Select keywords'],
  ['competitors', 'Competitors'],
  ['engines', 'AI engines'],
];
// The customer's own screens name their pages; inside the admin those names switch tabs.
const NAV = { aeoDashboard: 'dashboard', home: 'dashboard', aeoPrompts: 'prompts', aeoCompetitors: 'competitors', aeoEngines: 'engines' };

/** A customer's Run Analysis results, with the same keyword selection the customer has. */
export function AdminAeoAnalysisPage({ selectedUser, onSelectUser }) {
  const { ws, loading } = useWorkspace(selectedUser);
  const [tab, setTab] = useState('prompts');
  const go = (p) => { if (NAV[p]) setTab(NAV[p]); };
  return (
    <div>
      <SectionHeader title="Analysis & Keywords" subtitle="See a customer's Run Analysis results, choose the keywords to work on, and set up their brand kit and logo. Everything you save appears on the customer's screen." />
      <div className={s.layout}>
        <CustomerList selectedUser={selectedUser} onSelectUser={onSelectUser} />
        <div className={s.main}>
          {!selectedUser && <Empty icon="🔎" title="Choose a customer" body="Pick a customer to see their analysis results." />}
          {selectedUser && (loading || !ws) && <SkeletonCard rows={4} />}
          {ws && (
            <>
              <UserHeader ws={ws} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TABS.map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                    style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${tab === id ? '#4f46e5' : '#e2e8f0'}`, background: tab === id ? '#eef0ff' : '#fff', color: tab === id ? '#3730a3' : '#334155', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <CustomerView ws={ws} setup onNavigate={go}>
                {tab === 'dashboard' && <DashboardPage />}
                {tab === 'prompts' && <PromptsPage />}
                {tab === 'competitors' && <CompetitorsAeoPage />}
                {tab === 'engines' && <EnginesPage />}
              </CustomerView>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
