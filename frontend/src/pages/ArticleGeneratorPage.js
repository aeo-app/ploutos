import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { articleApi } from '../api/articleApi';
import { withTokenExpiry } from '../api/authApi';
import { Card, SectionHeader, Badge, ErrorCard, CopyButton, Empty } from '../components/ui/UI';
import s from './ArticleGeneratorPage.module.css';

const DEFAULT_BRIEF = {
  business_name: '',
  url: '',
  target_audience: '',
  primary_goal: '',
  industry: '',
  core_topics: '',
  editorial_angle: '',
  target_commercial_intent: '',
  problem_aware_intent: '',
  target_word_count: 2000,
};

function Field({ label, hint, value, onChange, placeholder, textarea, type = 'text', full }) {
  const Tag = textarea ? 'textarea' : 'input';
  return (
    <div className={`${s.field} ${full ? s.briefGridFull : ''}`}>
      <span className={s.fieldLabel}>{label} {hint && <span className={s.fieldHint}>— {hint}</span>}</span>
      <Tag
        className={`${s.input} ${textarea ? s.textarea : ''}`}
        type={textarea ? undefined : type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function ArticleGeneratorPage() {
  const { toast } = useApp();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const updateBrief = (field, value) => setBrief(b => ({ ...b, [field]: value }));

  const [topic, setTopic] = useState('');
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState(null);
  const [researchError, setResearchError] = useState(null);

  const [generating, setGenerating] = useState(false);
  const [article, setArticle] = useState(null);
  const [articleError, setArticleError] = useState(null);

  const buildBriefPayload = () => ({
    business_name: brief.business_name.trim(),
    url: brief.url.trim(),
    target_audience: brief.target_audience.trim(),
    primary_goal: brief.primary_goal.trim(),
    industry: brief.industry.trim(),
    core_topics: brief.core_topics.trim(),
    editorial_angle: brief.editorial_angle.trim(),
    target_commercial_intent: brief.target_commercial_intent.split('\n').map(l => l.trim()).filter(Boolean),
    problem_aware_intent: brief.problem_aware_intent.split('\n').map(l => l.trim()).filter(Boolean),
    target_word_count: Number(brief.target_word_count) || 2000,
  });

  const briefIsComplete = () =>
    brief.business_name.trim() && brief.url.trim() && brief.target_audience.trim() &&
    brief.primary_goal.trim() && brief.industry.trim() && brief.core_topics.trim() &&
    brief.editorial_angle.trim() && topic.trim();

  const runResearch = async () => {
    if (!briefIsComplete()) {
      setResearchError('Fill in the brief and a topic first.');
      return;
    }
    setResearching(true);
    setResearchError(null);
    setResearch(null);
    setArticle(null);
    try {
      const data = await withTokenExpiry(
        articleApi.researchBrief({ brief: buildBriefPayload(), topic: topic.trim() }),
        authCtx
      );
      setResearch(data);
    } catch (e) {
      if (e?.code === 'DomainMismatch') {
        setResearchError(e.message);
      } else if (e?.code !== 'TokenExpired') {
        setResearchError(e.message || 'Could not generate a research brief.');
        toast({ type: 'error', message: e.message || 'Could not generate a research brief.' });
      }
    } finally {
      setResearching(false);
    }
  };

  const runGenerate = async () => {
    if (!research) return;
    setGenerating(true);
    setArticleError(null);
    try {
      const data = await withTokenExpiry(
        articleApi.generate({ brief: buildBriefPayload(), topic: topic.trim(), research }),
        authCtx
      );
      setArticle(data);
      toast({ type: 'success', message: '✓ Article ready.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') {
        setArticleError(e.message || 'Could not write the article.');
        toast({ type: 'error', message: e.message || 'Could not write the article.' });
      }
    } finally {
      setGenerating(false);
    }
  };

  const fullArticleText = () => {
    if (!article) return '';
    const parts = [
      article.seo_title, '',
      article.introduction, '',
      ...(article.sections || []).flatMap(sec => [sec.heading, sec.body, '']),
      'Practical tactics:',
      ...(article.practical_tactics || []).map(t => `- ${t}`), '',
      'FAQ:',
      ...(article.faq || []).flatMap(f => [f.question, f.answer, '']),
      article.final_thought,
    ];
    return parts.join('\n');
  };

  return (
    <div className={s.page}>
      <SectionHeader
        title="Article Generator"
        subtitle="A two-phase writer: research the topic first, review the plan, then generate the full article from it."
      />

      <Card style={{ marginBottom: 20 }}>
        <SectionHeader title="Editorial brief" subtitle="Fill this in once — it carries over to every topic you research and write below." />
        <div className={s.briefGrid}>
          <Field label="Business name" value={brief.business_name} onChange={v => updateBrief('business_name', v)} placeholder="AEO App" />
          <Field label="Website URL" value={brief.url} onChange={v => updateBrief('url', v)} placeholder="https://aeo-app.ai" />
          <Field label="Target audience" value={brief.target_audience} onChange={v => updateBrief('target_audience', v)} placeholder="Businesses and business owners in Kerala" />
          <Field label="Primary goal" value={brief.primary_goal} onChange={v => updateBrief('primary_goal', v)} placeholder="Organic search traffic and qualified commercial interest" />
          <Field label="Industry" value={brief.industry} onChange={v => updateBrief('industry', v)} placeholder="Digital marketing" />
          <Field label="Target word count" type="number" value={brief.target_word_count} onChange={v => updateBrief('target_word_count', v)} />
          <Field
            full label="Core topics" value={brief.core_topics} onChange={v => updateBrief('core_topics', v)}
            placeholder="Answer Engine Optimization (AEO), SEO, GEO, AI search, Google AI Overviews, ChatGPT, Gemini, Perplexity, Copilot, local SEO, Malayalam/Manglish search behaviour"
            textarea
          />
          <Field
            full label="Unique editorial angle" value={brief.editorial_angle} onChange={v => updateBrief('editorial_angle', v)}
            placeholder="Kerala businesses + local SEO + Manglish/Malayalam-English search queries + AI search platforms. Use Kerala-specific examples where they genuinely improve the explanation."
            textarea
          />
          <Field
            label="Target commercial intent" hint="one per line" value={brief.target_commercial_intent}
            onChange={v => updateBrief('target_commercial_intent', v)}
            placeholder={"AEO services Kerala\nbest AEO company Kerala\nhow much does AEO cost in Kerala"}
            textarea
          />
          <Field
            label="Problem-aware intent" hint="one per line" value={brief.problem_aware_intent}
            onChange={v => updateBrief('problem_aware_intent', v)}
            placeholder={"Why is my website traffic dropping?\nWhy is my business not showing in Google search?"}
            textarea
          />
        </div>

        <div className={s.topicRow}>
          <Field label="Article topic" value={topic} onChange={setTopic} placeholder="Why is my business not showing in Google AI search?" />
          <button type="button" className={s.actionBtn} onClick={runResearch} disabled={researching}>
            {researching ? 'Researching…' : '1. Research this topic'}
          </button>
        </div>
      </Card>

      {researching && <div className={s.loadingRow}><span className={s.spinner} /><span>Planning the article — search intent, content gaps, sources, pillars…</span></div>}
      {researchError && !researching && <ErrorCard message={researchError} />}

      {research && !researching && (
        <Card style={{ marginBottom: 20 }}>
          <SectionHeader title="Research brief" subtitle={`Phase 1 result for "${research.topic}"`} />
          <div className={s.disclaimerBanner}>⚠️ {research.methodology_disclaimer}</div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Primary search intent</div>
            <div style={{ fontSize: 13.5, color: 'var(--c-slate-700)' }}>{research.primary_search_intent}</div>
          </div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Secondary intents</div>
            <div className={s.chipList}>
              {(research.secondary_intents || []).map((i, idx) => <span key={idx} className={s.chip}>{i}</span>)}
            </div>
          </div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Content gaps</div>
            <ul className={s.bulletList}>
              {(research.content_gaps || []).map((g, idx) => <li key={idx}>{g}</li>)}
            </ul>
          </div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Suggested subtopics</div>
            <ul className={s.bulletList}>
              {(research.suggested_subtopics || []).map((t, idx) => <li key={idx}>{t}</li>)}
            </ul>
          </div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Research sources to verify</div>
            <table className={s.sourceTable}>
              <thead>
                <tr><th>Type</th><th>Source</th><th>Why it's relevant</th></tr>
              </thead>
              <tbody>
                {(research.research_sources || []).map((src, idx) => (
                  <tr key={idx}>
                    <td><Badge>{src.source_type}</Badge></td>
                    <td>{src.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.name}</a> : src.name}</td>
                    <td>{src.relevance_note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.researchSection}>
            <div className={s.researchSectionLabel}>Content-cluster pillars</div>
            <div className={s.pillarGrid}>
              {(research.content_pillars || []).map((p, idx) => (
                <div key={idx} className={s.pillarCard}>
                  <div className={s.pillarName}>{p.pillar_name}</div>
                  <div className={s.pillarTopic}>{p.pillar_page_topic}</div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className={s.actionBtn} onClick={runGenerate} disabled={generating} style={{ marginTop: 10 }}>
            {generating ? 'Writing…' : '2. Write the full article'}
          </button>
        </Card>
      )}

      {generating && <div className={s.loadingRow}><span className={s.spinner} /><span>Writing the article from the research brief…</span></div>}
      {articleError && !generating && <ErrorCard message={articleError} />}

      {article && !generating && (
        <Card>
          <div className={s.disclaimerBanner}>⚠️ {article.fact_check_reminder}</div>

          <div className={s.articleHeader}>
            <div className={s.articleTitle}>{article.seo_title}</div>
            <div className={s.metaRow}>
              <Badge variant="brand">{article.word_count} words</Badge>
              <span className={s.metaField}>Meta title: {article.meta_title}</span>
              <span className={s.metaField}>Slug: /{article.url_slug}</span>
              <CopyButton text={fullArticleText()} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-slate-500)' }}>{article.meta_description}</div>
          </div>

          <div className={s.articleSection}>
            <div className={s.articleBody}>{article.introduction}</div>
          </div>

          {(article.sections || []).map((sec, idx) => (
            <div key={idx} className={s.articleSection}>
              <div className={s.articleSectionHeading}>{sec.heading}</div>
              <div className={s.articleBody}>{sec.body}</div>
            </div>
          ))}

          <div className={s.articleSection}>
            <div className={s.articleSectionHeading}>Practical tactics</div>
            <ul className={s.bulletList}>
              {(article.practical_tactics || []).map((t, idx) => <li key={idx}>{t}</li>)}
            </ul>
          </div>

          <div className={s.articleSection}>
            <div className={s.articleSectionHeading}>FAQ</div>
            {(article.faq || []).map((f, idx) => (
              <div key={idx} className={s.faqItem}>
                <div className={s.faqQuestion}>{f.question}</div>
                <div className={s.faqAnswer}>{f.answer}</div>
              </div>
            ))}
          </div>

          <div className={s.articleSection}>
            <div className={s.articleBody} style={{ fontStyle: 'italic' }}>{article.final_thought}</div>
          </div>
        </Card>
      )}

      {!research && !researching && !article && (
        <Empty icon="📝" title="No article yet" body="Fill in the editorial brief and a topic above, then research it before writing the full article." />
      )}
    </div>
  );
}
