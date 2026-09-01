import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { socialApi } from '../api/socialApi';
import { withTokenExpiry } from '../api/authApi';
import { Card, Badge, SectionHeader, Empty, ErrorCard, CopyButton } from '../components/ui/UI';
import { Button } from '../components/ui/Button';
import { UnlockModal } from '../components/payment/UnlockModal';
import { LockedTeaser } from '../components/payment/LockedTeaser';
import { historyApi } from '../api/historyApi';
import { CanvaPosterPanel } from '../components/canva/CanvaPosterPanel';
import { SocialPublishPanel } from '../components/canva/SocialPublishPanel';
import { ScheduledPostsList } from '../components/canva/ScheduledPostsList';
import { socialPublishApi } from '../api/socialPublishApi';
import s from './RelocationCalendarPage.module.css';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'google_business', label: 'Google Business' },
];

const TONE_VARIANT = { emotional: 'danger', professional: 'info', educational: 'brand', storytelling: 'warning' };
const CTA_VARIANT = { soft: 'default', urgent: 'danger', informative: 'info' };

/* ── One post's platform-tabbed captions ─────────────────────────────── */
function PostCard({ post, dayDate }) {
  const [platform, setPlatform] = useState('instagram');
  const caption = post.captions?.[platform] || '';
  const [posterId, setPosterId] = useState(null);
  const [actionTab, setActionTab] = useState('create'); // 'create' | 'publish'

  return (
    <div className={s?.postCard}>
      <div className={s?.postHead}>
        <div className={s?.postBadges}>
          <Badge variant="brand">{post?.content_type}</Badge>
          <Badge>{post?.category}</Badge>
          <Badge variant={TONE_VARIANT[post?.tone] || 'default'}>{post?.tone}</Badge>
          <Badge variant={CTA_VARIANT[post?.cta_style] || 'default'}>{post?.cta_style} CTA</Badge>
        </div>
      </div>

      {post?.is_simulated_story && (
        <div className={s?.simulatedNote}>
          ⚠ Illustrative / simulated story for engagement — not a real customer testimonial.
        </div>
      )}

      <div className={s?.platformTabs}>
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`${s?.platformTab} ${platform === p.id ? s?.platformTabActive : ''}`}
            onClick={() => setPlatform(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={s?.captionBox}>
        <div className={s?.captionCopyBtn}><CopyButton text={caption} /></div>
        {caption}
      </div>

      <div className={s?.visualBox}>
        <span>🖼️</span>
        <span><strong>Visual suggestion:</strong> {post?.visual_suggestion}</span>
      </div>

      <div className={s?.ctaRow}>
        <span className={s?.ctaPill}>{post?.cta}</span>
      </div>

      {post?.hashtags?.length > 0 && (
        <div className={s?.hashtagRow}>
          {post?.hashtags.map((h, i) => (
            <span key={i} className={s?.hashtag}>{h.startsWith('#') ? h : `#${h}`}</span>
          ))}
        </div>
      )}

      {post.content_type === 'Carousel' && post.carousel_slides?.length > 0 && (
        <div className={s?.carouselList}>
          {post.carousel_slides.map((slide, i) => (
            <div key={i} className={s?.carouselSlide}>
              <span className={`${s?.slideNum} ${slide?.role === 'hook' ? s?.slideNumHook : slide?.role === 'cta' ? s?.slideNumCta : ''}`}>
                {slide?.slide_number}
              </span>
              <span>{slide?.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className={s?.actionTabBar}>
        <button
          type="button" className={`${s?.actionTab} ${actionTab === 'create' ? s?.actionTabActive : ''}`}
          onClick={() => setActionTab('create')}
        >
          🎨 Create Poster
        </button>
        <button
          type="button" className={`${s?.actionTab} ${actionTab === 'publish' ? s?.actionTabActive : ''}`}
          onClick={() => setActionTab('publish')}
        >
          📤 Publish{posterId ? '' : ' (upload your own)'}
        </button>
      </div>

      <div style={{ display: actionTab === 'create' ? 'block' : 'none' }}>
        <CanvaPosterPanel
          dayDate={dayDate} postNumber={post.post_number} defaultText={caption || post.cta}
          visualSuggestion={post.visual_suggestion} category={post.category} tone={post.tone} cta={post.cta}
          onPosterChange={p => { setPosterId(p?.poster_id || null); if (p) setActionTab('publish'); }}
        />
      </div>

      <div style={{ display: actionTab === 'publish' ? 'block' : 'none' }}>
        <SocialPublishPanel
          api={socialPublishApi}
          dayDate={dayDate}
          posterId={posterId}
          defaultCaption={caption || post.cta}
        />
      </div>
    </div>
  );
}

/* ── One day's card (collapsible) ────────────────────────────────────── */
export function DayCard({ day, index, defaultOpen, onUnlock }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const schedule = day.schedule; // DayScheduleSlot wraps the real DailySchedule here — null if locked
  const rt = schedule?.recommended_times;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.4) }}>
      <div className={s?.dayCard}>
        <div className={s?.dayHead} onClick={() => !day?.locked && setOpen(o => !o)}>
          <div className={s?.dayTitle}>
            <span className={s?.dayDate}>{day?.date}</span>
            <span className={s?.dayWeekday}>{day?.day_of_week}</span>
          </div>
          {day?.locked ? (
            <span className={s?.dayToggle}>🔒 Locked</span>
          ) : (
            <span className={s?.dayToggle}>{open ? '▲ Hide' : '▼ Show 2 posts'}</span>
          )}
        </div>

        {day?.locked && (
          <div className={s?.dayBody}>
            <LockedTeaser previewText={day?.preview_text} onUnlock={() => onUnlock?.(day?.date)} />
          </div>
        )}

        {!day?.locked && open && (
          <>
            <div className={s?.dayTimesRow}>
              <span className={s?.dayTimeChip}>IG: {rt?.instagram.join(' / ')}</span>
              <span className={s?.dayTimeChip}>FB: {rt?.facebook.join(' / ')}</span>
              <span className={s?.dayTimeChip}>LinkedIn: {rt?.linkedin || 'not recommended (weekend)'}</span>
              <span className={s?.dayTimeChip}>GBP: {rt?.google_business}</span>
            </div>
            <div className={s?.dayBody}>
              {schedule?.posts.map((post, i) => <PostCard key={i} post={post} dayDate={day?.date} />)}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

const toISODate = (d) => d.toISOString().slice(0, 10);

/* ── Static result view — renders a saved RelocationSocialResponse (e.g. from
   History) exactly like the live streaming page does. ──────────────────── */
export function RelocationCalendarResultView({ result }) {
  if (!result) return null;
  const days = result.days || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padded={false}>
        <div className={s?.progressSummary}>
          <Badge variant="brand">{result?.period_label}</Badge>
          <span className={s?.progressCount}>{days.length} days</span>
          {Object.keys(result?.failed_dates || {}).length > 0 && (
            <span className={s?.progressCount}>{Object.keys(result?.failed_dates).length} failed</span>
          )}
        </div>
      </Card>

      {result?.content_disclaimer && (
        <div className={s?.visualBox} style={{ borderStyle: 'solid', borderColor: 'var(--c-warning)' }}>
          <span>⚠️</span><span>{result?.content_disclaimer}</span>
        </div>
      )}

      {days.map((day, i) => (
        <DayCard key={day.date} day={day} index={i} defaultOpen={i === 0} onUnlock={() => {}} />
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export function RelocationCalendarPage() {
  const { state, setResultKey, setLoadingKey, toast } = useApp();
  const { goScreen, logout } = useAuth();

  const [country, setCountry] = useState('');
  const [contentSuggestions, setContentSuggestions] = useState('');
  const [company, setCompany] = useState({
    name: state.request.company_name || '',
    phone: '', email: '', website: '', instagram: '', facebook: '', linkedin: '',
  });
  const updateCompany = (field, value) => setCompany(c => ({ ...c, [field]: value }));

  const prepopulatedRef = useRef(false);

  useEffect(() => {
    if (prepopulatedRef.current) return;
    prepopulatedRef.current = true;
    historyApi?.list({ analysisType: 'relocation_social_calendar', limit: 1 })
      .then(data => {
        const latest = data?.items?.[0];
        if (!latest) return null;
        return historyApi?.getOne(latest.analysis_id);
      })
      .then(full => {
        const savedReq = full?.request;
        if (savedReq) {
          if (savedReq.country) setCountry(savedReq.country);
          if (savedReq.company) {
            setCompany(c => ({ ...c, ...savedReq.company }));
          }
        }
        // Also refresh the actual displayed result on every visit to this
        // page — not just once per full app load. AppShell's own
        // rehydration effect only runs a single time when the app first
        // mounts, and stays mounted across in-app (sidebar) navigation, so
        // it never re-fires just from revisiting this page. Without this,
        // an admin-created or admin-revised calendar (or any change made
        // in another tab/session) wouldn't show up here until the user did
        // a full browser refresh, not just clicking back into this page.
        if (full?.result) { setResultKey('relocationCalendar', full.result); setFormExpanded(false); }
      })
      .catch(err => console.warn('[RelocationCalendarPage] history prepopulation failed:', err?.message || err));
  }, []);

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const twoWeeksOut = new Date(); twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const [startDate, setStartDate] = useState(toISODate(tomorrow));
  const [endDate, setEndDate] = useState(toISODate(twoWeeksOut));

  const [periodLabel, setPeriodLabel] = useState('');
  const [totalDays, setTotalDays] = useState(0);
  const [days, setDays] = useState([]);
  const [failedDates, setFailedDates] = useState({});
  const [showFailureDetails, setShowFailureDetails] = useState(false);
  const [disclaimer, setDisclaimer] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [formExpanded, setFormExpanded] = useState(!state.results.relocationCalendar);
  const [showUnlock, setShowUnlock] = useState(false);
  const abortRef = useRef(null);

  const loading = state?.loading?.relocationCalendar || streaming;

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleEvent = useCallback((event, data) => {
    switch (event) {
      case 'start':
        setPeriodLabel(data?.period_label);
        setTotalDays(data?.total_days);
        break;
      case 'day_ready':
        // The backend emits the raw DailySchedule here (not wrapped in a
        // slot, unlike day_locked) — wrap it locally so DayCard can treat
        // every day uniformly as { date, day_of_week, locked, schedule }.
        setDays(prev => [
          ...prev,
          { date: data?.date, day_of_week: data?.day_of_week, locked: false, schedule: data },
        ].sort((a, b) => a?.date?.localeCompare(b?.date)));
        break;
      case 'day_locked':
        // Zero-cost teaser slot — no Bedrock call was made for this day.
        setDays(prev => [...prev, data?.slot].sort((a, b) => a?.date?.localeCompare(b?.date)));
        break;
      case 'day_error':
        setFailedDates(prev => ({ ...prev, [data?.date]: data?.error }));
        break;
      case 'done':
        if (data.result) {
          setResultKey('relocationCalendar', data.result);
          setDisclaimer(data?.result?.content_disclaimer || null);
          setFormExpanded(false);
        }
        break;
      case 'error':
        setStreamError(data?.error || 'Something went wrong while generating the calendar.');
        break;
      default:
        break;
    }
  }, [setResultKey]);

  const dateRangeInvalid = endDate < startDate;
  const rangeDays = dateRangeInvalid ? 0 : Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  const rangeTooLong = rangeDays > 62;

  const run = async () => {
    if (!country.trim() || !company.name.trim() || dateRangeInvalid || rangeTooLong) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamError(null);
    setDays([]);
    setFailedDates({});
    setShowFailureDetails(false);
    setDisclaimer(null);
    setPeriodLabel('');
    setTotalDays(0);
    setStreaming(true);
    setLoadingKey('relocationCalendar', true);

    const req = {
      country: country?.trim(),
      company: {
        name: company?.name?.trim(),
        phone: company?.phone?.trim() || null,
        email: company?.email?.trim() || null,
        website: company?.website?.trim() || null,
        instagram: company?.instagram?.trim() || null,
        facebook: company?.facebook?.trim() || null,
        linkedin: company?.linkedin?.trim() || null,
      },
      start_date: startDate,
      end_date: endDate,
      content_suggestions: contentSuggestions?.trim(),
    };

    try {
      await withTokenExpiry(
        socialApi?.relocationCalendarStream(req, handleEvent, controller.signal),
        { goScreen, logout }
      );
      toast({ type: 'success', message: '✓ Content calendar generated.' });
    } catch (e) {
      if (e?.name !== 'AbortError' && e?.code !== 'TokenExpired') {
        const msg = e?.code === 'DomainMismatch' ? e.message : (e.message || 'Request failed.');
        setStreamError(msg);
        toast({ type: 'error', message: msg });
      }
    } finally {
      setStreaming(false);
      setLoadingKey('relocationCalendar', false);
    }
  };

  const cancel = () => { abortRef.current?.abort(); setStreaming(false); setLoadingKey('relocationCalendar', false); };

  const hasStarted = totalDays > 0;
  const errorCount = Object.keys(failedDates).length;
  const lockedCount = days.filter(d => d.locked).length;
  const progressPct = totalDays ? Math.round((days.length / totalDays) * 100) : 0;

  return (
    <div className={s.page}>
      <ScheduledPostsList api={socialPublishApi} />

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionHeader
          title="Relocation Social Media Calendar"
          subtitle={formExpanded
            ? "Any country, any date range — platform-ready captions for Instagram, Facebook, LinkedIn & Google Business, with a randomised, non-repetitive posting schedule."
            : `${company?.name || 'Your'} calendar for ${country || 'your destination'}, ${periodLabel || `${startDate} → ${endDate}`}`}
          right={
            <button type="button" className={s?.formToggleBtn} onClick={() => setFormExpanded(v => !v)}>
              {formExpanded ? 'Hide form' : '✎ New calendar / edit settings'}
            </button>
          }
        />

        {formExpanded && (
          <>
        <div className={s?.formRow}>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Country*</span>
            <input className={s?.input} value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Canada" />
          </div>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Company name*</span>
            <input className={s?.input} value={company?.name} onChange={e => updateCompany('name', e.target.value)} placeholder="Your company name" />
          </div>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Start date*</span>
            <input className={s?.input} style={{ minWidth: 160 }} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>End date*</span>
            <input className={s?.input} style={{ minWidth: 160 }} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className={s?.formRow}>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Phone</span>
            <input className={s?.input} value={company?.phone} onChange={e => updateCompany('phone', e.target.value)} placeholder="Optional" />
          </div>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Email</span>
            <input className={s?.input} value={company?.email} onChange={e => updateCompany('email', e.target.value)} placeholder="Optional" />
          </div>
          <div className={s?.field}>
            <span className={s?.fieldLabel}>Website</span>
            <input className={s?.input} value={company?.website} onChange={e => updateCompany('website', e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className={s?.field} style={{ marginBottom: 12 }}>
          <span className={s?.fieldLabel}>Content suggestions</span>
          <textarea
            className={s?.input}
            style={{ minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
            value={contentSuggestions}
            onChange={e => setContentSuggestions(e.target.value)}
            placeholder="Optional — themes, angles, offers, or anything else to weave into this calendar. e.g. 'Focus more on families with school-age kids, and mention our partnership with a local relocation lawyer.'"
          />
        </div>

        {dateRangeInvalid && <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>End date must be on or after the start date.</div>}
        {!dateRangeInvalid && rangeTooLong && <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>That's {rangeDays} days — max range is 62 days (one Bedrock call per day). Split into multiple requests.</div>}
        {!dateRangeInvalid && !rangeTooLong && rangeDays > 0 && <div style={{ fontSize: 13, color: 'var(--c-slate-400)' }}>{rangeDays} day{rangeDays !== 1 ? 's' : ''} × 2 posts = {rangeDays * 2} posts</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={run} loading={loading} disabled={!country.trim() || !company.name.trim() || dateRangeInvalid || rangeTooLong || loading} size="lg">
            {loading ? 'Generating…' : '📅 Generate Content Calendar'}
          </Button>
          {loading && <Button variant="ghost" onClick={cancel}>Cancel</Button>}
          {loading && <span style={{ fontSize: 13, color: 'var(--c-slate-400)' }}>Days stream in as they're written — one short call per day, not one giant one.</span>}
        </div>
          </>
        )}
      </Card>

      {hasStarted && (
        <motion.div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card padded={false}>
            <div className={s?.progressSummary}>
              <Badge variant={errorCount ? 'warning' : 'brand'}>{periodLabel}</Badge>
              <div className={s?.progressBarWrap}><div className={s?.progressBarFill} style={{ width: `${progressPct}%` }} /></div>
              <span className={s?.progressCount}>{days.length}/{totalDays} days</span>
              {lockedCount > 0 && <Badge variant="warning">🔒 {lockedCount} locked — upgrade to unlock</Badge>}
              {errorCount > 0 && (
                <button
                  type="button"
                  className={s?.progressCount}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
                  onClick={() => setShowFailureDetails(v => !v)}
                >
                  {errorCount} failed {showFailureDetails ? '▲' : '▼ (why?)'}
                </button>
              )}
            </div>
            {errorCount > 0 && showFailureDetails && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(failedDates).map(([failedDate, reason]) => (
                  <div key={failedDate} style={{ fontSize: 12.5, color: 'var(--c-slate-600)' }}>
                    <strong>{failedDate}:</strong> {reason}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <AnimatePresence>
            {disclaimer && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className={s?.visualBox} style={{ borderStyle: 'solid', borderColor: 'var(--c-warning)' }}>
                  <span>⚠️</span><span>{disclaimer}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {days?.map((day, i) => (
            <DayCard key={day?.date} day={day} index={i} defaultOpen={i === 0} onUnlock={() => setShowUnlock(true)} />
          ))}
        </motion.div>
      )}

      {streamError && !hasStarted && <ErrorCard message={streamError} />}

      {/* No live run this session, but a previous result was rehydrated from
          history on load (see AppShell) — show it as-is rather than "no
          calendar generated yet", so refreshing doesn't lose what was
          already generated. */}
      {!hasStarted && !loading && !streamError && state.results.relocationCalendar && (
        <RelocationCalendarResultView result={state.results.relocationCalendar} />
      )}

      {!hasStarted && !loading && !streamError && !state.results.relocationCalendar && (
        <Empty
          icon="📅"
          title="No calendar generated yet"
          body="Enter a destination country and a date range above and generate relocation content — streamed in day by day."
        />
      )}

      {showUnlock && (
        <UnlockModal
          title="Unlock every day"
          subtitle="Your free preview covers one day. Choose a plan to unlock the full calendar instantly."
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => { setShowUnlock(false); run(); }}
        />
      )}
    </div>
  );
}
