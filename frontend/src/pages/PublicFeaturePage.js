import React from 'react';

const FEATURES = {
  'competitor-analysis': {
    eyebrow: 'Competitive intelligence',
    title: 'See how your competitors win search.',
    description: 'Compare SEO visibility, estimated domain authority, organic traffic, rankings, and strategic strengths across your market.',
    points: ['Competitor landscape mapping', 'SEO visibility and ranking comparisons', 'AI-generated strategic takeaways'],
  },
  'keyword-intelligence': {
    eyebrow: 'Keyword intelligence',
    title: 'Find the queries that create demand.',
    description: 'Turn search behavior into a focused content plan with volume, intent, competition, and position estimates for Asia-Pacific markets.',
    points: ['Head, service, and long-tail terms', 'Transactional and informational intent', 'Priority recommendations for growth'],
  },
  'company-profile': {
    eyebrow: 'Company profiles',
    title: 'Show up clearly everywhere customers look.',
    description: 'Generate polished, platform-ready company descriptions for LinkedIn and Google Business Profile in seconds.',
    points: ['LinkedIn company overview copy', 'Google Business description', 'Specialties and category recommendations'],
  },
  'domain-authority': {
    eyebrow: 'Domain authority',
    title: 'Build the authority your next ranking needs.',
    description: 'Translate backlink gaps into a practical growth plan with targets, effort estimates, and prioritized actions.',
    points: ['Current and target authority trajectory', 'Competitor benchmark gap analysis', 'Prioritized backlink opportunities'],
  },
  'full-report': {
    eyebrow: 'Full SEO report',
    title: 'Get the complete picture in one run.',
    description: 'Combine competitor analysis, keyword intelligence, company profiles, and domain authority strategy into one AI-powered report.',
    points: ['Four analyses in one workflow', 'Consolidated executive overview', 'Ready-to-use recommendations'],
  },
  'content-strategy': {
    eyebrow: 'Content strategy',
    title: 'Plan content around real buyer questions.',
    description: 'Create an answer-engine-aware content strategy built around the prompts and topics your customers actually use.',
    points: ['Topic and prompt opportunities', 'Intent-led content planning', 'SEO-informed content briefs'],
  },
  'social-media-calendar': {
    eyebrow: 'Social media calendar',
    title: 'Keep your market presence moving.',
    description: 'Generate a practical month of relocation and business content, then prepare it for publishing across connected channels.',
    points: ['Monthly content calendars', 'Platform-ready post ideas', 'Scheduling and publishing workflows'],
  },
  'blog-generation': {
    eyebrow: 'Blog generation',
    title: 'Turn SEO opportunities into publishable articles.',
    description: 'Generate structured, search-informed blog content from topics and target keywords discovered in your strategy.',
    points: ['SEO-informed topic suggestions', 'Full article generation', 'Editable, reusable content output'],
  },
  'article-generator': {
    eyebrow: 'Article generator',
    title: 'Create useful articles without the blank page.',
    description: 'Move from a brief to a clear, well-structured article draft with the context your audience and market require.',
    points: ['Brief-driven article drafts', 'Structured headings and metadata', 'Copy-ready content workflow'],
  },
};

export function PublicFeaturePage({ slug }) {
  const feature = FEATURES[slug] || FEATURES['full-report'];

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ color: '#0f172a', fontWeight: 800, fontSize: 20, textDecoration: 'none' }}>aeo-app<span style={{ color: '#4f46e5' }}>.ai</span></a>
        <a href="/" style={{ color: '#475569', fontSize: 14, textDecoration: 'none' }}>Back to home</a>
      </nav>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '96px 28px 120px' }}>
        <div style={{ color: '#4f46e5', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 18 }}>{feature.eyebrow}</div>
        <h1 style={{ maxWidth: 760, margin: 0, fontSize: 'clamp(38px, 7vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.04em' }}>{feature.title}</h1>
        <p style={{ maxWidth: 650, margin: '28px 0 36px', color: '#475569', fontSize: 19, lineHeight: 1.7 }}>{feature.description}</p>
        <a href="/#audit" style={{ display: 'inline-block', padding: '14px 22px', borderRadius: 8, background: '#4f46e5', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Start with AEO Intel</a>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginTop: 72 }}>
          {feature.points.map((point) => (
            <div key={point} style={{ padding: 22, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#334155', lineHeight: 1.5 }}>{point}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
