import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { aeoApi } from '../../api/aeoApi';
import { useAeo } from '../AeoContext';
import { EmptyAnalysis } from '../parts';
import { checkedLine, RED, AMBER, GREEN } from '../dashParts';
import { useSocialChannels } from '../social';
import { readSavedSiteChecks } from '../siteChecks';
import { Icon } from '../Icon';
import { checkedAnswers, citedCount, engineNames, fmtDate, hostOf, isReal, num, overallVis, sovRank, youSov } from '../utils';
import '../fullReport.css';

/* ── Full Report ──────────────────────────────────────────────────────────────
   Everything the app already knows about the customer, on one page, in plain words.
   It only reads what is already saved: the latest analysis (loaded at login), the last
   speed test and the last website check. Nothing is re-checked when the page opens. */

const MUTE = '#6b6a85';
const CHECK_COLOR = { good: GREEN, warn: AMBER, bad: RED, info: '#1c1b3a' };
const SPEED_WORD = { good: 'Fast', warn: 'Needs work', bad: 'Slow' };

const day = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const pct = (v, max) => `${Math.max(0, Math.min(100, max ? (v / max) * 100 : 0))}%`;
const band = (v, cuts, labels, colors) => { const i = v < cuts[0] ? 0 : v < cuts[1] ? 1 : 2; return { label: labels[i], color: colors[i] }; };
// prefixing https:// keeps a stored value from ever becoming a javascript: link
const siteUrl = (site) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);
const shownFor = (p) => p.engines.some(x => x != null && x !== 0);

function change(cur, was, since, unit = '') {
  if (cur == null || was == null) return null;
  const d = Math.round(cur - was);
  if (d === 0) return { text: `No change since ${since}`, color: MUTE };
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} since ${since}`, color: d > 0 ? GREEN : RED };
}

function Section({ title, text, children, id }) {
  return (
    <section className="dv-card" data-print-card data-testid={id}>
      <div className="fr-sec"><span className="fr-sec-t">{title}</span>{text && <span className="dv-sub">{text}</span>}</div>
      {children}
    </section>
  );
}

function Stat({ label, value, unit, tag, delta, explain, children }) {
  return (
    <div className="fr-stat">
      <span className="fr-stat-l">{label}</span>
      <span className="fr-stat-v">{value}{unit && <small>{unit}</small>}</span>
      {tag && <span className="fr-stat-tag"><i style={{ background: tag.color }} />{tag.label}</span>}
      {delta && <span className="fr-change" style={{ color: delta.color }}>{delta.text}</span>}
      {children}
      {explain && <span className="fr-stat-x">{explain}</span>}
    </div>
  );
}

function BarRow({ name, sub, value, width, you, other, tip }) {
  return (
    <div className="fr-row" title={tip}>
      <span className={`fr-row-n${you ? ' you' : ''}`}>{name}{sub && <small>{sub}</small>}</span>
      <div className="fr-bar" role="img" aria-label={tip}><i className={other ? 'other' : ''} style={{ width }} /></div>
      <span className="fr-row-v">{value}</span>
    </div>
  );
}

function GoButton({ to, children }) {
  const { setPage } = useApp();
  return <button type="button" className="dv-btn sm dv-nopr" style={{ alignSelf: 'flex-start' }} onClick={() => { setPage(to); window.scrollTo(0, 0); }}>{children}</button>;
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function Header({ analysis, lastRun }) {
  const { state } = useApp();
  const r = state.request;
  const when = day(analysis.checked_at || lastRun);
  return (
    <div className="dv-card fr-head" data-print-card data-testid="fr-head">
      <h2>Full report for {r.company_name || 'your business'}</h2>
      <span className="dv-sub">{[hostOf(r.url), r.market, r.industry].filter(Boolean).join(' · ')}</span>
      <span className="dv-sub">{when ? `Based on your analysis from ${when}. ` : ''}This page shows results we already have, so nothing is checked again when you open it.</span>
      <span className="dv-tiny dv-nopr"><Icon name="download" size={14} />To save or share this report, click “Export PDF” at the top.</span>
    </div>
  );
}

function Scores({ analysis, prev, da }) {
  // The first analysis with real answers isn't compared with an older estimated one: they measured different things.
  const firstReal = !!checkedLine(analysis) && !!prev && !checkedLine(prev);
  const before = firstReal ? null : prev;
  const since = (cur, was, unit) => (before ? change(cur, was, 'last analysis', unit) : { text: firstReal ? 'First check with real answers' : 'First analysis', color: MUTE });

  const prompts = analysis.prompts || [];
  const vis = overallVis(prompts);
  const sov = youSov(analysis), rk = sovRank(analysis);
  const answers = checkedAnswers(prompts);
  const cited = citedCount(prompts);
  const site = analysis.website;
  const strength = site ? site.score : da?.current_da != null ? Number(da.current_da) : null;
  const citeTag = cited === 0 ? { label: 'None yet', color: RED } : cited / Math.max(answers, 1) < 0.25 ? { label: 'A few', color: AMBER } : { label: 'Often', color: GREEN };
  const tools = analysis.checked_engines?.length ? analysis.checked_engines : engineNames(analysis);

  return (
    <Section id="fr-scores" title="Your scores" text="How you're doing in AI search right now.">
      <div className="fr-grid">
        <Stat label="Seen in AI answers" value={vis ?? '—'} unit="/100" tag={vis == null ? null : band(vis, [20, 50], ['Low', 'Fair', 'Good'], [RED, AMBER, GREEN])}
          delta={since(vis, overallVis(before?.prompts))} explain="How often AI tools like ChatGPT recommend you when people ask about businesses like yours." />
        <Stat label="Your share vs competitors" value={sov != null ? `${sov}%` : '—'} tag={rk ? { label: `#${rk.rank} of ${rk.of}`, color: rk.rank === 1 ? GREEN : AMBER } : null}
          delta={since(sov, youSov(before), '%')} explain="Out of all the times AI names a business like yours, how often it names you." />
        <Stat label="AI answers with your link" value={cited} unit={` of ${answers}`} tag={citeTag}
          delta={since(cited, before ? citedCount(before.prompts) : null)} explain="How many AI answers gave people a link to your website." />
        <Stat label="Domain Authority" value={strength ?? '—'} unit="/100"
          tag={strength == null ? null : band(strength, site ? [20, 40] : [40, 60], ['Needs work', 'Fair', 'Strong'], [AMBER, AMBER, GREEN])}
          explain={site ? `${num(site.linking_sites)} website${site.linking_sites === 1 ? '' : 's'} link to you. Google and AI trust websites that others link to.` : 'How much Google and AI trust your website.'} />
      </div>
      <div className="fr-facts">
        <span><b>{prompts.filter(isReal).length}</b> questions checked</span>
        <span><b>{num(answers)}</b> AI answers read</span>
        <span>AI tools checked: <b>{tools.join(', ')}</b></span>
      </div>
    </Section>
  );
}

function Questions({ analysis }) {
  const real = (analysis.prompts || []).filter(isReal);
  const shown = real.filter(shownFor).length;
  const missed = real.filter(p => !shownFor(p)).sort((a, b) => (b.volume_estimate || 0) - (a.volume_estimate || 0)).slice(0, 5);

  return (
    <Section id="fr-questions" title="Questions people ask AI" text="We asked AI tools questions your customers might ask, and checked if they mentioned you.">
      {real.length ? (
        <>
          <div className="fr-facts"><span>AI tools mentioned you in <b>{shown}</b> of <b>{real.length}</b> questions.</span></div>
          <div className="dv-col" style={{ gap: 6 }}>
            <span className="dv-h3">Questions where AI doesn't mention you yet</span>
            <span className="dv-sub">Most searched on Google first.</span>
            {missed.length ? (
              <ul className="fr-list">
                {missed.map(p => <li key={p.text}><span>{p.text}</span><span>{p.volume_estimate ? `${num(p.volume_estimate)} searches a month` : 'Few searches'}</span></li>)}
              </ul>
            ) : <span className="dv-sub">AI mentions you for every question we checked.</span>}
          </div>
        </>
      ) : <span className="dv-sub">No questions were checked in this analysis.</span>}
      <GoButton to="aeoPrompts">See all questions</GoButton>
    </Section>
  );
}

function Competitors({ analysis }) {
  const total = analysis.prompts_total || (analysis.prompts || []).filter(p => !p.locked).length;
  const all = (analysis.competitors || []).filter(c => !c.pending).sort((a, b) => b.share_of_voice - a.share_of_voice);
  const rows = all.slice(0, 8);
  const you = all.find(c => c.is_you);
  if (you && !rows.includes(you)) rows.push(you);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map(c => c.share_of_voice));
  return (
    <Section id="fr-competitors" title="You vs your competitors" text="Out of all the times AI names a business like yours, how often it names each one.">
      <div className="fr-rows">
        {rows.map(c => (
          <BarRow key={c.name} name={`${c.name}${c.is_you ? ' (you)' : ''}`} you={c.is_you} other={!c.is_you}
            sub={[c.domain_authority != null ? `Domain Authority ${c.domain_authority}` : '', total ? `Named in ${c.prompts_cited} of ${total} questions` : ''].filter(Boolean).join(' · ')}
            value={`${c.share_of_voice}%`} width={pct(c.share_of_voice, max)} tip={`${c.name}: named in ${c.share_of_voice}% of AI mentions`} />
        ))}
      </div>
      <GoButton to="aeoCompetitors">See all competitors</GoButton>
    </Section>
  );
}

function Strength({ analysis, da }) {
  const site = analysis.website;
  const score = site ? site.score : da?.current_da != null ? Number(da.current_da) : null;
  const links = (analysis.link_opportunities || []).slice(0, 5);
  if (score == null && !links.length) return null;
  return (
    <Section id="fr-strength" title="Domain Authority" text="How much Google and AI trust your website. It grows when good websites link to yours.">
      <div className={site ? 'fr-grid three' : 'fr-grid'}>
        <Stat label="Your score" value={score ?? '—'} unit="/100" />
        {site && <Stat label="Websites that link to you" value={num(site.linking_sites)} />}
        {site && <Stat label="Links to you in total" value={num(site.backlinks)} />}
      </div>
      {links.length > 0 && (
        <div className="dv-col" style={{ gap: 6 }}>
          <span className="dv-h3">Websites that could link to you</span>
          <span className="dv-sub">They link to your competitors but not to you. Open each one, see where it mentions your competitor, and get listed the same way.</span>
          <ul className="fr-list">
            {links.map(o => <li key={o.site}><span><a className="fr-link" href={siteUrl(o.site)} target="_blank" rel="noopener noreferrer">{o.site}</a>{o.links_to?.length ? <small className="dv-tiny" style={{ display: 'block' }}>Links to {o.links_to.slice(0, 2).join(', ')}</small> : null}</span><span>Domain Authority {o.score}</span></li>)}
          </ul>
          {analysis.link_opportunities_total > links.length && <span className="dv-tiny">{num(analysis.link_opportunities_total)} websites found in total.</span>}
        </div>
      )}
      <GoButton to="da">See Domain Authority details</GoButton>
    </Section>
  );
}

function Sources({ analysis }) {
  const top = (list) => [...(list || [])].sort((a, b) => b.count - a.count).slice(0, 8);
  const sites = top(analysis.source_sites), places = top(analysis.platforms);
  if (!sites.length && !places.length) return null;
  const list = (items, title, what) => {
    const max = Math.max(1, ...items.map(x => x.count));
    return (
      <div className="dv-col" style={{ gap: 6 }}>
        <span className="dv-h3">{title}</span>
        <div className="fr-rows">
          {items.map(x => <BarRow key={x.name} name={x.name} value={`${x.count} answer${x.count === 1 ? '' : 's'}`} width={pct(x.count, max)} tip={`${x.name}: ${what} in ${x.count} answers`} />)}
        </div>
      </div>
    );
  };
  return (
    <Section id="fr-sources" title="Where AI gets its answers" text="AI tools send people to the places on the right, and read the websites on the left. Have a profile on those places, and post on those websites, so AI finds you.">
      <div className="fr-grid two">
        {sites.length > 0 && list(sites, 'Websites AI read', 'used')}
        {places.length > 0 && list(places, 'Places AI mentioned (directories, marketplaces)', 'mentioned')}
      </div>
    </Section>
  );
}

function Speed({ speed }) {
  const text = "Google loads your homepage on a phone and on a computer and scores its speed out of 100. Slow websites lose visitors.";
  if (speed === undefined) return <Section id="fr-speed" title="Website speed (Google test)" text={text}><span className="dv-sub">Loading…</span></Section>;
  if (!speed) return <Section id="fr-speed" title="Website speed (Google test)" text={text}><div className="fr-empty">Not tested yet.<GoButton to="insights">Test it on the Insights page</GoButton></div></Section>;
  const { report, history = [] } = speed;
  const last = history.length >= 2 ? history[history.length - 2] : null;
  const fixes = (report.mobile?.fixes?.length ? report.mobile.fixes : report.desktop?.fixes || []).slice(0, 3);
  return (
    <Section id="fr-speed" title="Website speed (Google test)" text={text}>
      <div className="fr-grid two">
        {[['mobile', 'On phones'], ['desktop', 'On computers']].map(([key, label]) => {
          const d = report[key] || {};
          return (
            <Stat key={key} label={label} value={d.score ?? '—'} unit="/100"
              tag={SPEED_WORD[d.status] ? { label: SPEED_WORD[d.status], color: CHECK_COLOR[d.status] } : null}
              delta={last ? change(d.score, last[key], 'last test') : null} explain={d.error || ''} />
          );
        })}
      </div>
      {fixes.length > 0 && (
        <div className="dv-col" style={{ gap: 6 }}>
          <span className="dv-h3">What slows it down most</span>
          <ul className="fr-list">
            {fixes.map(f => <li key={f.title}><span><b>{f.title}</b>{f.action ? <small className="dv-tiny" style={{ display: 'block' }}>{f.action}</small> : null}</span></li>)}
          </ul>
        </div>
      )}
      <span className="dv-tiny">Tested on {day(report.checked_at)}</span>
      <GoButton to="insights">See speed details</GoButton>
    </Section>
  );
}

function Checks({ checks }) {
  const text = 'Simple checks that show whether AI tools can find and understand your website.';
  if (checks === undefined) return <Section id="fr-checks" title="Website check for AI" text={text}><span className="dv-sub">Loading…</span></Section>;
  if (!checks) return <Section id="fr-checks" title="Website check for AI" text={text}><div className="fr-empty">Not checked yet.<GoButton to="profile">Check it on Company Profile</GoButton></div></Section>;
  const rows = (checks.checks || []).filter(c => c.key !== 'speed');
  return (
    <Section id="fr-checks" title="Website check for AI" text={text}>
      {checks.error && <span className="ae-err">{checks.error}</span>}
      <div className="dv-col">
        {rows.map(c => (
          <div key={c.key} className="fr-check">
            <span>{c.label}{c.hint && <small>{c.hint}</small>}</span>
            <b style={{ color: CHECK_COLOR[c.status] || CHECK_COLOR.info }}>{c.value}</b>
          </div>
        ))}
      </div>
      {checks.checked_at && <span className="dv-tiny">Checked on {day(checks.checked_at)}</span>}
      <GoButton to="profile">Open Company Profile</GoButton>
    </Section>
  );
}

function Content({ soc }) {
  const { saved, team, brand } = useAeo();
  const posts = Object.values(saved.post_state || {}).filter(Boolean);
  const blogsApproved = Object.values(saved.blog_state || {}).filter(b => b && b.approved).length;
  const connected = soc.channels.filter(c => c.key === 'connected').length;
  return (
    <Section id="fr-content" title="Your content and social media" text="What we've made for you so far, and what's been published.">
      <div className="fr-grid">
        <Stat label="Questions picked for content" value={saved.selected_prompts.length} />
        <Stat label="Blogs written for you" value={team.blogs.length} />
        <Stat label="Blogs you approved" value={blogsApproved} />
        <Stat label="Posters and reels made" value={posts.filter(p => p.img || p.vid).length} />
        <Stat label="Posts waiting to go out" value={posts.filter(p => p.approved && !p.published).length} />
        <Stat label="Posts published" value={posts.filter(p => p.published).length} />
        <Stat label="Social accounts connected" value={soc.loaded ? connected : '…'} unit={soc.loaded ? ` of ${soc.channels.length}` : ''} />
        <Stat label="Brand kit" value={brand.complete ? 'Ready' : 'Not finished'}
          explain={brand.complete ? '' : 'Add your logo and phone number so we can put them on your posters.'} />
      </div>
    </Section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function FullReportPage() {
  const { state } = useApp();
  const { analysis, prev, lastRun, loading } = useAeo();
  const soc = useSocialChannels();
  const [speed, setSpeed] = useState(undefined);     // undefined = loading, null = never tested
  const [checks, setChecks] = useState(undefined);   // undefined = loading, null = never checked
  const url = state.request.url;

  useEffect(() => {
    let off = false;
    aeoApi.speedTest()
      .then(d => { if (!off) setSpeed(d?.report ? d : null); })
      .catch(() => { if (!off) setSpeed(null); });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!url) { setChecks(null); return undefined; }
    let off = false;
    readSavedSiteChecks(url)
      .then(d => { if (!off) setChecks(d?.checks?.length || d?.error ? d : null); })
      .catch(() => { if (!off) setChecks(null); });
    return () => { off = true; };
  }, [url]);

  if (loading || !analysis) {
    return <EmptyAnalysis title="Your full report will appear after your first analysis"
      text="We'll check how AI tools talk about your business, then put all your results on this one page." />;
  }
  const da = state.results.domainAuthority || state.results.fullReport?.domain_authority_strategy;

  return (
    <div className="dv-page" data-testid="full-report">
      <Header analysis={analysis} lastRun={lastRun} />
      <Scores analysis={analysis} prev={prev} da={da} />
      <Questions analysis={analysis} />
      <Competitors analysis={analysis} />
      <Strength analysis={analysis} da={da} />
      <Sources analysis={analysis} />
      <Speed speed={speed} />
      <Checks checks={checks} />
      <Content soc={soc} />
    </div>
  );
}
