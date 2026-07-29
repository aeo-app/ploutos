import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, SectionHeader, SkeletonCard, Empty, ErrorCard, Tag, CopyButton, CharCount } from '../components/ui/UI';
import s from './DataPage.module.css';

function ProfileBlock({ title, icon, text, max, platform, helper }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text?.slice(0, 240);
  const needsTruncate = text?.length > 240;

  return (
    <Card className={s.profileBlock}>
      <div className={s.profileBlockHead}>
        <span style={{ fontSize: '22px' }}>{icon}</span>
        <div className={s.profileBlockTitle}>{title}</div>
        {helper && <span style={{ fontSize: '12px', color: 'var(--c-slate-500)' }}>{helper}</span>}
        <CharCount text={text} max={max} />
        <CopyButton text={text || ''} />
      </div>
      {platform && (
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-slate-500)' }}>
          📍 Paste into: <Badge variant="brand">{platform}</Badge>
        </div>
      )}
      <div className={s.profileText}>
        {needsTruncate && !expanded ? preview + '…' : text}
      </div>
      {needsTruncate && (
        <button className={s.showMore} onClick={() => setExpanded(v => !v)}>
          {expanded ? '↑ Show less' : '↓ Show full text'}
        </button>
      )}
    </Card>
  );
}

export function ProfilePage() {
  const { state, runApi, toast } = useApp();
  const loading = state.loading.profile;
  const error   = state.errors.profile;
  const data    = state.results.profile || state.results.fullReport?.company_profile;

  const run = async (req) => {
    try { await runApi('profile', seoApi.profile, req); toast({ type: 'success', message: '✓ Company profiles generated.' }); }
    catch (_) {}
  };

  return (
    <div className={s.page}>
      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="Generate Profiles" compact={!!data} />
      {loading && <div className={s.skeletons}>{[1,2].map(i => <SkeletonCard key={i} rows={9}/>)}</div>}
      {error && !loading && <ErrorCard message={error} />}

      {data && !loading && (
        <motion.div className={s.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

          {/* Tagline */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-slate-400)', marginBottom: '8px' }}>Generated Tagline</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--c-slate-900)', letterSpacing: '-0.01em' }}>
                  "{data.tagline}"
                </div>
              </div>
              <CopyButton text={data.tagline} />
            </div>
          </Card>

          {/* LinkedIn */}
          <ProfileBlock
            title="LinkedIn Company Overview"
            icon="🔵"
            text={data.linkedin_overview}
            max={2000}
            platform="LinkedIn → Edit page → Overview"
            helper="Up to 2,000 characters"
          />

          {/* Google Business */}
          <ProfileBlock
            title="Google Business Profile Description"
            icon="🔴"
            text={data.google_business_description}
            max={750}
            platform="Google Business → Edit profile → Description"
            helper="Up to 750 characters"
          />

          {/* LinkedIn Specialties */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <SectionHeader title="LinkedIn Specialties" subtitle="Add these in the Specialties field on your LinkedIn page" />
              <CopyButton text={data.linkedin_specialties?.join(', ') || ''} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {data.linkedin_specialties?.map((t, i) => <Tag key={i}>{t}</Tag>)}
            </div>
            <div className={s.profileText} style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--c-slate-500)' }}>
              {data.linkedin_specialties?.join(', ')}
            </div>
          </Card>

          {/* Google Categories */}
          <Card>
            <SectionHeader title="Google Business Categories" subtitle="Set these in your Google Business Profile settings" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.google_business_categories?.map((cat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--c-slate-50)', border: '1px solid var(--c-slate-200)', borderRadius: 'var(--r-md)' }}>
                  <Badge variant={i === 0 ? 'success' : 'default'}>{i === 0 ? 'Primary' : `Secondary ${i}`}</Badge>
                  <span style={{ fontSize: '14px', color: 'var(--c-slate-800)' }}>{cat}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Meta */}
          <Card>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--c-slate-400)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company</div>
                <div style={{ fontWeight: 600, color: 'var(--c-slate-800)' }}>{data.company_name}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--c-slate-400)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Website</div>
                <a href={data.url} target="_blank" rel="noreferrer" style={{ color: 'var(--c-indigo-600)', fontWeight: 500 }}>{data.url}</a>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
      {!data && !loading && !error && (
        <Empty icon="📋" title="No profiles yet" body="Generate AI-written LinkedIn and Google Business descriptions for any company." />
      )}
    </div>
  );
}
