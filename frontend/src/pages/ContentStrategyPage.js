import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { seoApi } from '../api/seoApi';
import { withTokenExpiry } from '../api/authApi';
import { Card, Badge, SectionHeader, Empty, ErrorCard, InsightCard, CopyButton } from '../components/ui/UI';
import { Button } from '../components/ui/Button';
import s from './ContentStrategyPage.module.css';
import ds from './DataPage.module.css';

const MAX_PRIMARY = 5;
const MAX_TOTAL = 8;

const STATUS_LABEL = {
  pending: 'Queued', analyzing: 'Analysing competitors', backlinks: 'Building backlink plan',
  writing: 'Writing content', ready: 'Ready', error: 'Failed',
};
const STATUS_CLASS = {
  pending: s.statusPending, analyzing: s.statusAnalyzing, backlinks: s.statusAnalyzing,
  writing: s.statusWriting, ready: s.statusReady, error: s.statusError,
};
const TIER_VARIANT = { high: 'success', medium: 'info', foundational: 'default' };

/* ── Shared: keyword suggestions sourced from Keyword Intelligence ──────── */
function useKeywordSuggestions() {
  const { state } = useApp();
  const kwData = state.results.keywords || state.results.fullReport?.keyword_volume;
  if (!kwData) return [];
  const all = [
    ...(kwData.high_volume_head_terms || []),
    ...(kwData.mid_volume_service_terms || []),
    ...(kwData.long_tail_high_intent || []),
  ].map(k => k.keyword).filter(Boolean);
  return [...new Set(all)].slice(0, 30);
}

/* ── Keyword chip input ─────────────────────────────────────────────── */
function ChipInput({ values, onAdd, onRemove, placeholder, max, variant }) {
  const [text, setText] = useState('');
  const full = max != null && values.length >= max;

  const commit = () => {
    const v = text.trim();
    if (v && !full) onAdd(v);
    setText('');
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !text && values.length) onRemove(values.length - 1);
  };

  return (
    <div className={`${s.chipInputWrap} ${full ? s.chipInputWrapFull : ''}`}>
      {values.map((v, i) => (
        <span key={v + i} className={`${s.chip} ${variant === 'additional' ? s.chipAdditional : ''}`}>
          {v}
          <button type="button" className={s.chipRemove} onClick={() => onRemove(i)}>×</button>
        </span>
      ))}
      {!full && (
        <input
          className={s.chipInput}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={values.length ? '' : placeholder}
        />
      )}
    </div>
  );
}

/* ── Primary keyword picker — a SELECT, not free text ────────────────── */
function PrimaryKeywordSelect({ values, onAdd, onRemove, max }) {
  const suggestions = useKeywordSuggestions();
  const [selectValue, setSelectValue] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');
  const full = values.length >= max;
  const usedLower = new Set(values.map(v => v.toLowerCase()));
  const available = suggestions.filter(o => !usedLower.has(o.toLowerCase()));

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === '__custom__') { setCustomMode(true); setSelectValue(''); return; }
    if (val) { onAdd(val); setSelectValue(''); }
  };

  const commitCustom = () => {
    const v = customText.trim();
    if (v && !usedLower.has(v.toLowerCase())) onAdd(v);
    setCustomText('');
    setCustomMode(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {values.length > 0 && (
        <div className={s.chipRow}>
          {values.map((v, i) => (
            <span key={v + i} className={s.chip}>
              {v}
              <button type="button" className={s.chipRemove} onClick={() => onRemove(i)}>×</button>
            </span>
          ))}
        </div>
      )}

      {!full && !customMode && (
        <select
          className={s.keywordSelect}
          value={selectValue}
          onChange={handleSelectChange}
        >
          <option value="" disabled>
            {suggestions.length ? 'Select a keyword…' : 'No suggestions yet — pick "Add a custom keyword"'}
          </option>
          {available.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__custom__">+ Add a custom keyword…</option>
        </select>
      )}

      {!full && customMode && (
        <div className={s.customRow}>
          <input
            autoFocus
            className={s.companyInput}
            value={customText}
            placeholder="Type a keyword…"
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitCustom(); }
              if (e.key === 'Escape') setCustomMode(false);
            }}
          />
          <Button size="sm" variant="secondary" onClick={commitCustom}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCustomMode(false); setCustomText(''); }}>Cancel</Button>
        </div>
      )}

      {full && <div className={s.pickerHint}>Maximum of {max} primary keywords reached — remove one to add another.</div>}
      {!suggestions.length && !customMode && (
        <div className={s.pickerHint}>
          Run <strong>Keywords</strong> analysis first to populate this list with real suggestions.
        </div>
      )}
    </div>
  );
}


/* ── Suggested keywords sourced from Keyword Intelligence (for the free-text
   additional-keywords field) ─────────────────────────────────────────── */
function SuggestedKeywords({ used, onPick }) {
  const suggestions = useKeywordSuggestions();
  if (!suggestions.length) {
    return (
      <div className={s.pickerHint}>
        Run <strong>Keywords</strong> analysis first to pick suggestions here — or just type your own above.
      </div>
    );
  }
  return (
    <div className={s.suggestedWrap}>
      {suggestions.map(kw => {
        const isUsed = used.has(kw.toLowerCase());
        return (
          <button
            key={kw}
            type="button"
            className={`${s.suggestedPill} ${isUsed ? s.suggestedPillUsed : ''}`}
            onClick={() => !isUsed && onPick(kw)}
          >
            {isUsed ? '✓ ' : '+ '}{kw}
          </button>
        );
      })}
    </div>
  );
}

/* ── One keyword's progress card ─────────────────────────────────────── */
function KeywordCard({ kw, progress, index }) {
  const p = progress || { status: 'pending' };
  const bdd = p.backlinkDeepDive || p.report?.backlink_deep_dive;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card padded={false}>
        <div className={s.kwCardHead}>
          <span className={s.kwTitle}>{kw}</span>
          <span className={`${s.statusBadge} ${STATUS_CLASS[p.status]}`}>
            {['analyzing', 'backlinks', 'writing'].includes(p.status) && <span className={s.statusDot} />}
            {STATUS_LABEL[p.status]}
          </span>
        </div>

        {(p.status !== 'pending') && (
          <div className={s.kwBody}>
            {p.analysis && (
              <>
                <div>
                  <div className={ds.cardHead} style={{ padding: '0 0 8px' }}>
                    <SectionHeader title="Top-ranking competitors" />
                  </div>
                  <div className={s.competitorRow}>
                    {(p.analysis.top_competitors || []).map((c, i) => (
                      <span key={i} className={s.competitorPill}>#{c.rank} {c.company}</span>
                    ))}
                  </div>
                </div>
                <div className={s.rankingBox}>
                  <strong>How they rank:</strong> {p.analysis.ranking_explanation?.backlink_strategy_summary}{' '}
                  {p.analysis.ranking_explanation?.content_quality_summary}
                </div>
              </>
            )}

            {p.status === 'backlinks' && !bdd && (
              <div className={s.writingWrap}>
                <span className={s.writingSpinner} />
                <span className={s.writingText}>Reverse-engineering backlink patterns &amp; building a replication plan…</span>
              </div>
            )}

            {bdd && <BacklinkDeepDiveBlock bdd={bdd} />}

            {p.status === 'writing' && (
              <div className={s.writingWrap}>
                <span className={s.writingSpinner} />
                <span className={s.writingText}>Writing an original, SEO-optimised content piece…</span>
                <span className={s.writingChars}>{p.charsGenerated || 0} chars</span>
              </div>
            )}

            {p.status === 'error' && (
              <div className={s.rankingBox} style={{ background: 'var(--c-danger-bg)', borderColor: 'var(--c-danger)', color: 'var(--c-danger)' }}>
                {p.error || 'This keyword failed to generate. The others continued unaffected.'}
              </div>
            )}

            {p.status === 'ready' && p.report && (
              <GeneratedContentBlock report={p.report} />
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* ── Backlink deep-dive: real platforms, acquisition steps, replication plan ── */
function BacklinkDeepDiveBlock({ bdd }) {
  const rp = bdd.replication_plan;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={s.rankingBox}>
        <strong>How they likely earned these backlinks:</strong> {bdd.how_they_likely_earned_backlinks}
      </div>
      <div className={s.rankingBox}>
        <strong>Repeated pattern:</strong> {bdd.repeated_platforms_pattern}
      </div>

      <div>
        <div className={ds.cardHead} style={{ padding: '0 0 8px' }}>
          <SectionHeader title="Backlink opportunities" subtitle="Real platforms — see methodology note below" />
        </div>
        <div className={s.bddGrid}>
          {(bdd.backlink_opportunities || []).map((cat, i) => (
            <div key={i} className={s.bddCategory}>
              <div className={s.bddCategoryHead}>
                <span className={s.bddCategoryName}>{cat.category}</span>
                <Badge variant={TIER_VARIANT[cat.authority_tier] || 'default'}>{cat.authority_tier}</Badge>
              </div>
              <div className={s.tagRow}>
                {(cat.real_platforms || []).map((pl, j) => (
                  <a key={j} href={pl.url} target="_blank" rel="noreferrer" className={s.platformLink}>{pl.name} ↗</a>
                ))}
              </div>
              <div className={s.bddMeta}>{cat.backlink_type} · anchor pattern: “{cat.typical_anchor_text_pattern}”</div>
              <ol className={s.stepsList}>
                {(cat.acquisition_steps || []).map((step, k) => <li key={k}>{step}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {bdd.high_authority_highlights?.length > 0 && (
        <div>
          <div className={s.pickerLabel} style={{ marginBottom: 8 }}>Prioritise first</div>
          <div className={ds.insights}>
            {bdd.high_authority_highlights.map((h, i) => <div key={i} className={s.rankingBox}>{h}</div>)}
          </div>
        </div>
      )}

      {rp && (
        <div>
          <div className={s.pickerLabel} style={{ marginBottom: 8 }}>Replication plan</div>
          <div className={s.replicationGrid}>
            <div>
              <div className={s.metaLabel}>Guest posts</div>
              <div className={s.tagRow}>{(rp.guest_post_opportunities || []).map((x, i) => <Badge key={i}>{x}</Badge>)}</div>
            </div>
            <div>
              <div className={s.metaLabel}>Directories</div>
              <div className={s.tagRow}>{(rp.directory_submissions || []).map((x, i) => <Badge key={i}>{x}</Badge>)}</div>
            </div>
            <div>
              <div className={s.metaLabel}>PR / articles</div>
              <div className={s.tagRow}>{(rp.pr_article_platforms || []).map((x, i) => <Badge key={i}>{x}</Badge>)}</div>
            </div>
            <div>
              <div className={s.metaLabel}>Forums / communities</div>
              <div className={s.tagRow}>{(rp.forums_communities || []).map((x, i) => <Badge key={i}>{x}</Badge>)}</div>
            </div>
          </div>
          <ol className={s.stepsList} style={{ marginTop: 10 }}>
            {(rp.step_by_step_plan || []).map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ── Final rendered content piece for one keyword ────────────────────── */
function GeneratedContentBlock({ report }) {
  const c = report.generated_content;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className={s.contentHead}>
        <div className={s.contentTitle}>{c.title}</div>
        <Badge variant="brand">{c.content_type}</Badge>
      </div>

      <div className={s.metaGrid}>
        <div className={s.metaBlock}>
          <div className={s.metaLabel}>Meta title</div>
          <div className={s.metaValue}>{c.meta_title}</div>
        </div>
        <div className={s.metaBlock}>
          <div className={s.metaLabel}>URL slug</div>
          <div className={s.metaValue}>/{c.url_slug}</div>
        </div>
        <div className={s.metaBlock} style={{ gridColumn: '1 / -1' }}>
          <div className={s.metaLabel}>Meta description</div>
          <div className={s.metaValue}>{c.meta_description}</div>
        </div>
      </div>

      <div>
        <div className={ds.cardHead} style={{ padding: '0 0 8px' }}>
          <SectionHeader title="Outline" subtitle={`${c.word_count} words · ${c.tone} tone`} />
        </div>
        <div className={s.headingsList}>
          {(c.headings || []).map((h, i) => (
            <div key={i} className={s.headingItem}>
              <span className={s.headingLevel}>{h.level}</span>
              <span>{h.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={s.bodyBox}>
        <div className={ds.cardHead} style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionHeader title="Ready-to-publish draft" />
          <CopyButton text={c.body} />
        </div>
        <div className={ds.profileText}>{c.body}</div>
      </div>

      <div className={s.ctaBox}>Primary CTA: “{c.primary_cta}”</div>

      <div>
        <div className={s.pickerLabel} style={{ marginBottom: 8 }}>Engagement &amp; conversion elements</div>
        <div className={s.tagRow}>
          {(c.engagement_elements || []).map((e, i) => <Badge key={i} variant="info">{e}</Badge>)}
        </div>
      </div>

      <div>
        <div className={s.pickerLabel} style={{ marginBottom: 8 }}>SEO optimisation notes</div>
        <div className={ds.insights}>
          {(c.seo_optimization_notes || []).map((n, i) => (
            <div key={i} className={s.rankingBox}>{n}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export function ContentStrategyPage() {
  const { state, setRequest, setResultKey, setLoadingKey, toast } = useApp();
  const { goScreen, logout } = useAuth();
  const { request } = state;

  const [primary, setPrimary] = useState([]);
  const [additional, setAdditional] = useState([]);
  const [order, setOrder] = useState([]);           // keyword order as returned by "start"
  const [progress, setProgress] = useState({});      // { [keyword]: {...} }
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [failedKeywords, setFailedKeywords] = useState({});
  const [methodologyDisclaimer, setMethodologyDisclaimer] = useState(null);
  const [backlinkDirectory, setBacklinkDirectory] = useState([]);
  const [repeatedPlatforms, setRepeatedPlatforms] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const abortRef = useRef(null);

  const loading = state.loading.contentStrategy || streaming;
  const usedLower = new Set([...primary, ...additional].map(k => k.toLowerCase()));
  const totalKeywords = primary.length + additional.length;

  useEffect(() => () => abortRef.current?.abort(), []); // cancel stream on unmount

  const patchProgress = useCallback((kw, patch) => {
    setProgress(prev => ({ ...prev, [kw]: { ...prev[kw], ...patch } }));
  }, []);

  const handleEvent = useCallback((event, data) => {
    switch (event) {
      case 'start':
        setOrder(data.keywords || []);
        setProgress(Object.fromEntries((data.keywords || []).map(k => [k, { status: 'pending' }])));
        break;
      case 'analysis':
        patchProgress(data.keyword, { status: 'backlinks', analysis: data.analysis, charsGenerated: 0 });
        break;
      case 'backlink_deep_dive':
        patchProgress(data.keyword, { status: 'writing', backlinkDeepDive: data.backlink_deep_dive });
        break;
      case 'content_delta':
        setProgress(prev => ({
          ...prev,
          [data.keyword]: {
            ...prev[data.keyword],
            status: 'writing',
            charsGenerated: (prev[data.keyword]?.charsGenerated || 0) + (data.text?.length || 0),
          },
        }));
        break;
      case 'keyword_report':
        patchProgress(data.keyword, { status: 'ready', report: data.report });
        break;
      case 'keyword_error':
        patchProgress(data.keyword, { status: 'error', error: data.error });
        break;
      case 'executive_summary':
        setExecutiveSummary(data.insights || []);
        break;
      case 'executive_summary_error':
        // non-fatal — per-keyword results still stand on their own
        break;
      case 'done':
        setFailedKeywords(data.failed_keywords || {});
        if (data.result) {
          setResultKey('contentStrategy', data.result);
          setMethodologyDisclaimer(data.result.methodology_disclaimer || null);
          setBacklinkDirectory(data.result.backlink_target_directory || []);
          setRepeatedPlatforms(data.result.repeated_high_value_platforms || []);
        }
        break;
      case 'error':
        setStreamError(data.error || 'Something went wrong while generating your content strategy.');
        break;
      default:
        break;
    }
  }, [patchProgress, setResultKey]);

  const run = async () => {
    if (!request.company_name || primary.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamError(null);
    setExecutiveSummary(null);
    setFailedKeywords({});
    setMethodologyDisclaimer(null);
    setBacklinkDirectory([]);
    setRepeatedPlatforms([]);
    setProgress({});
    setOrder([]);
    setStreaming(true);
    setLoadingKey('contentStrategy', true);

    const req = {
      company_name: request.company_name,
      url: request.url,
      market: request.market || 'Singapore',
      industry: request.industry || '',
      primary_keywords: primary,
      additional_keywords: additional,
    };

    try {
      await withTokenExpiry(
        seoApi.contentStrategyStream(req, handleEvent, controller.signal),
        { goScreen, logout }
      );
      toast({ type: 'success', message: '✓ Content strategy generated.' });
    } catch (e) {
      if (e?.name !== 'AbortError' && e?.code !== 'TokenExpired') {
        setStreamError(e.message || 'Request failed.');
        toast({ type: 'error', message: e.message || 'Request failed.' });
      }
    } finally {
      setStreaming(false);
      setLoadingKey('contentStrategy', false);
    }
  };

  const cancel = () => { abortRef.current?.abort(); setStreaming(false); setLoadingKey('contentStrategy', false); };

  const readyCount = Object.values(progress).filter(p => p.status === 'ready').length;
  const errorCount = Object.values(progress).filter(p => p.status === 'error').length;
  const hasStarted = order.length > 0;

  return (
    <div className={s.page}>
      {/* Company + keyword picker */}
      <Card className={s.pickerCard}>
        <SectionHeader
          title="Content Strategy Generator"
          subtitle="Pick up to 5 primary keywords — we'll find who's ranking, analyse why, and write you a matching content piece for each."
        />

        <div className={s.pickerRow}>
          <div className={s.companyRow}>
            <input
              className={s.companyInput}
              value={request.company_name}
              placeholder="Company name*"
              onChange={e => setRequest({ company_name: e.target.value })}
            />
            <input
              className={s.companyInput}
              value={request.url}
              placeholder="https://yourcompany.com"
              onChange={e => setRequest({ url: e.target.value })}
            />
          </div>
        </div>

        <div className={s.pickerRow}>
          <div className={s.pickerLabel}>
            Primary keywords
            <span className={`${s.pickerCount} ${primary.length >= MAX_PRIMARY ? s.pickerCountFull : ''}`}>
              {primary.length}/{MAX_PRIMARY}
            </span>
          </div>
          <PrimaryKeywordSelect
            values={primary}
            max={MAX_PRIMARY}
            onAdd={v => !usedLower.has(v.toLowerCase()) && setPrimary(p => [...p, v])}
            onRemove={i => setPrimary(p => p.filter((_, idx) => idx !== i))}
          />
        </div>

        <div className={s.pickerRow}>
          <div className={s.pickerLabel}>
            Additional keywords <span style={{ fontWeight: 400, color: 'var(--c-slate-400)' }}>(optional, from Keyword Intelligence)</span>
            <span className={s.pickerCount}>{totalKeywords}/{MAX_TOTAL} total</span>
          </div>
          <ChipInput
            values={additional}
            variant="additional"
            placeholder="Add extra keywords…"
            onAdd={v => !usedLower.has(v.toLowerCase()) && totalKeywords < MAX_TOTAL && setAdditional(a => [...a, v])}
            onRemove={i => setAdditional(a => a.filter((_, idx) => idx !== i))}
          />
          <SuggestedKeywords
            used={usedLower}
            onPick={kw => totalKeywords < MAX_TOTAL && setAdditional(a => [...a, kw])}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            onClick={run}
            loading={loading}
            disabled={!request.company_name || primary.length === 0 || loading}
            size="lg"
          >
            {loading ? 'Generating…' : '✍️ Generate Content Strategy'}
          </Button>
          {loading && <Button variant="ghost" onClick={cancel}>Cancel</Button>}
          {loading && <span className={s.hint}>Results stream in per keyword as they finish.</span>}
        </div>
      </Card>

      {/* Live progress */}
      {hasStarted && (
        <motion.div className={ds.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 20 }}>
          <Card padded={false}>
            <div className={s.progressSummary}>
              <Badge variant={errorCount ? 'warning' : 'brand'}>
                {readyCount}/{order.length} keyword{order.length !== 1 ? 's' : ''} ready
              </Badge>
              {errorCount > 0 && <span className={s.progressCount}>{errorCount} failed — others continued</span>}
            </div>
          </Card>

          <div className={s.kwGrid}>
            {order.map((kw, i) => <KeywordCard key={kw} kw={kw} progress={progress[kw]} index={i} />)}
          </div>

          <AnimatePresence>
            {methodologyDisclaimer && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className={s.rankingBox} style={{ background: 'var(--c-warning-bg)', borderColor: 'var(--c-warning)' }}>
                  <strong>Methodology:</strong> {methodologyDisclaimer}
                </div>
              </motion.div>
            )}

            {repeatedPlatforms.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <SectionHeader
                    title="Repeated high-value platforms"
                    subtitle="Recommended across 2+ of your keywords — computed directly from the analysis above, not a separate estimate"
                  />
                  <div className={s.bddGrid}>
                    {repeatedPlatforms.map((rp, i) => (
                      <div key={i} className={s.bddCategory}>
                        <div className={s.bddCategoryHead}>
                          <a href={rp.url} target="_blank" rel="noreferrer" className={s.platformLink}>{rp.name} ↗</a>
                          <Badge variant={TIER_VARIANT[rp.highest_authority_tier] || 'default'}>{rp.highest_authority_tier}</Badge>
                        </div>
                        <div className={s.bddMeta}>Relevant to: {rp.appears_for_keywords.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {backlinkDirectory.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <SectionHeader title="Websites you can use for backlinks" subtitle="Every distinct platform recommended across all your keywords, deduped" />
                  <div className={s.tagRow}>
                    {backlinkDirectory.map((pl, i) => (
                      <a key={i} href={pl.url} target="_blank" rel="noreferrer" className={s.platformLink}>{pl.name} ↗</a>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {executiveSummary && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <SectionHeader title="Executive Summary" subtitle="Cross-keyword strategic priorities" />
                  <div className={ds.insights}>
                    {executiveSummary.map((t, i) => <InsightCard key={i} {...t} index={i} />)}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {streamError && !hasStarted && <ErrorCard message={streamError} />}

      {!hasStarted && !loading && !streamError && (
        <Empty
          icon="✍️"
          title="No content strategy yet"
          body="Add up to 5 primary keywords above and generate competitor-informed, SEO-optimised content for each — streamed in as it's written."
        />
      )}
    </div>
  );
}
