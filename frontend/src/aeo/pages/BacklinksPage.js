import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { usePayment } from '../../context/PaymentContext';
import { aeoApi } from '../../api/aeoApi';
import { useAeo } from '../AeoContext';
import { copyToClipboard, hostOf } from '../utils';

const STATUS = [['todo', 'To do'], ['submitted', 'Asked / submitted'], ['live', 'Live']];
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-GB'));
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const keyOf = (d) => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

function Ext({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#4f46e5', wordBreak: 'break-all' }}>{children}</a>;
}

function outreach(row, company, site) {
  const ex = row.example || {};
  const rival = (row.links_to || [])[0]?.competitor;
  return `Subject: A resource for your readers\n\nHi,\n\nI came across ${ex.page_url || row.site_url}${rival ? ` where you link to ${rival}` : ''}. I run ${company} (${site}). We publish practical, up-to-date guidance that your readers may find useful, and I think a link to us would fit well there.\n\nHappy to send over a short, specific suggestion for which page and why. Would that be useful?\n\nThanks,\n${company}`;
}

function GapRow({ row, st, onStatus, onNote, onVerify, company, site, verifying }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState('');
  const [msg, setMsg] = useState('');
  const ex = row.example || {};
  const live = st.status === 'live' && st.verified_at;
  const check = async () => {
    setMsg('');
    const r = await onVerify(row.domain, page.trim());
    if (r) setMsg(r.found ? (r.nofollow ? 'Link found, but it is nofollow, so it passes less value.' : 'Link found and verified.') : 'We could not find a link to your website on that page yet.');
  };
  return (
    <div className="ae-bl-row">
      <div className="ae-bl-main">
        <div><b>{row.domain}</b> <span className="ae-sub">authority {row.authority ?? '–'}</span></div>
        <div className="ae-sub">
          Links to {(row.links_to || []).map(l => `${l.competitor} (${l.backlinks})`).join(', ')}
          {ex.page_url && <> · <Ext href={ex.page_url}>see the page that links to them</Ext></>}
          {' '}· <Ext href={row.site_url}>open site</Ext>
        </div>
        {live && <div className="ae-bl-ok">Verified {when(st.verified_at)} · <Ext href={st.live_url}>your link</Ext>{st.nofollow ? ' · nofollow' : ''}</div>}
      </div>
      <select className="ae-input" style={{ flex: '0 0 auto', minWidth: 150 }} value={st.status || 'todo'} onChange={e => onStatus(row.domain, e.target.value)} aria-label={`Status for ${row.domain}`}>
        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className="ae-btn sm" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'How to get this link'}</button>
      {open && (
        <div className="ae-bl-more">
          <ol className="ae-sub" style={{ margin: '0 0 10px 18px', padding: 0 }}>
            <li>Open the page that links to your competitor{ex.page_url ? '' : ' (look on their site)'} and see why they were included.</li>
            <li>Find the editor or site contact and send them a short, specific pitch (copy the template below).</li>
            <li>When they add your link, paste the address of that page here and press Verify.</li>
          </ol>
          <textarea className="ae-input" readOnly rows={7} style={{ width: '100%' }} value={outreach(row, company, site)} />
          <div className="ae-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="ae-btn sm" onClick={() => copyToClipboard(outreach(row, company, site))}>Copy email</button>
            <input className="ae-input" placeholder="Paste the page where your link now appears" value={page} onChange={e => setPage(e.target.value)} aria-label={`Page with your link on ${row.domain}`} />
            <button className="ae-btn sm primary" disabled={!page.trim() || verifying} onClick={check}>{verifying ? 'Checking…' : 'Verify'}</button>
          </div>
          {msg && <div className="ae-sub" style={{ marginTop: 6 }} role="status">{msg}</div>}
          <input className="ae-input" style={{ width: '100%', marginTop: 8 }} maxLength={300} placeholder="Note (who you contacted, when…)" defaultValue={st.note || ''} onBlur={e => e.target.value !== (st.note || '') && onNote(row.domain, e.target.value)} />
        </div>
      )}
    </div>
  );
}

export function BacklinksPage() {
  const { state, toast } = useApp();
  const { analysis, saved, patch, mergeSaved } = useAeo();
  const { isPaid } = usePayment();
  const r = state.request;
  const [data, setData] = useState(null);     // { configured, report, paid, can_refresh, next_refresh }
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    aeoApi.backlinks().then(d => live && setData(d)).catch(e => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const competitors = useMemo(() => (analysis?.competitors || []).filter(c => !c.is_you).map(c => c.domain || '').filter(d => /\./.test(d)).map(keyOf).filter((d, i, a) => d && a.indexOf(d) === i).slice(0, 4), [analysis]);
  const base = { company_name: r.company_name, url: r.url };

  const pull = async () => {
    setFetching(true); setError('');
    try { setData(await aeoApi.fetchBacklinks({ ...base, competitors })); }
    catch (e) { if (e.code !== 'PaymentRequired') setError(e.message || 'Could not get your backlinks right now.'); }
    finally { setFetching(false); }
  };

  const bs = saved.backlink_state || {};
  const setEntry = (domain, change) => {
    const k = keyOf(domain);
    patch({ backlink_state: { ...bs, [k]: { status: 'todo', ...(bs[k] || {}), ...change } } });
  };
  const verify = async (domain, page_url) => {
    setVerifying(true);
    try {
      const res = await aeoApi.verifyBacklink({ ...base, page_url, key: keyOf(domain) });
      if (res.entry) mergeSaved({ backlink_state: { ...bs, [keyOf(domain)]: res.entry } });
      return res;
    } catch (e) { toast?.({ type: 'error', message: e.message || 'Could not check that page.' }); return null; }
    finally { setVerifying(false); }
  };

  if (loading) return <div className="ae-empty"><h2>Loading…</h2><div className="ae-dots"><i /><i /><i /></div></div>;
  if (data && !data.configured) {
    return <div className="ae-empty"><h2>Real backlink data is coming soon</h2><p>We are connecting a live backlink index. Until it is switched on we will not show estimated or made-up links here.</p></div>;
  }
  const rep = data?.report;
  if (!rep) {
    return (
      <div className="ae-empty">
        <h2>{fetching ? 'Collecting your backlinks…' : 'See who really links to you'}</h2>
        <p>{fetching ? 'This usually takes under a minute.' : 'We pull the real pages that link to your website and the sites that link to your competitors but not to you, so you know exactly who to ask.'}</p>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {fetching ? <div className="ae-dots"><i /><i /><i /></div> : <button className="ae-btn primary" onClick={pull}>Get my backlinks</button>}
      </div>
    );
  }
  const s = rep.summary || {};
  const gap = rep.gap || [];
  const done = gap.filter(g => (bs[keyOf(g.domain)] || {}).status === 'live').length;
  const company = r.company_name || hostOf(r.url);
  const site = hostOf(r.url);

  return (
    <>
      <section className="ae-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="ae-sub">Real data for <b>{rep.domain}</b>, updated {when(rep.fetched_at)}.{!data.can_refresh && data.next_refresh ? ` You can refresh again after ${when(data.next_refresh)}.` : ''}</span>
        <button className="ae-btn sm primary" disabled={fetching || !data.can_refresh} onClick={pull}>{fetching ? 'Refreshing…' : 'Refresh'}</button>
      </section>
      {error && <section className="ae-card" role="alert" style={{ color: '#b91c1c' }}>{error}</section>}

      <section className="ae-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        {[['Backlinks', fmt(s.backlinks)], ['Referring domains', fmt(s.referring_domains)], ['Authority (0–100)', fmt(s.rank)], ['Spam score', s.spam_score == null ? '–' : `${s.spam_score}%`], ['Broken backlinks', fmt(s.broken_backlinks)], ['Nofollow domains', fmt(s.referring_domains_nofollow)]].map(([l, v]) => (
          <div className="ae-kpi" key={l}><span className="ae-eyebrow">{l}</span><b style={{ fontSize: 30, fontWeight: 800 }}>{v}</b></div>
        ))}
      </section>

      <section className="ae-card">
        <h3 style={{ margin: '0 0 4px' }}>Pages that link to you</h3>
        <p className="ae-sub" style={{ margin: '0 0 10px' }}>Real links found by a backlink index. Strongest sources first.</p>
        {rep.backlinks.length === 0 ? <p className="ae-sub">No backlinks were found for this domain yet.</p> : (
          <div className="ae-bl-scroll"><table className="ae-bl-table">
            <thead><tr><th>Linking page</th><th>Anchor</th><th>Type</th><th>Authority</th><th>First seen</th></tr></thead>
            <tbody>{rep.backlinks.map((b, i) => (
              <tr key={i} className={b.lost ? 'lost' : ''}>
                <td><Ext href={b.page_url}>{hostOf(b.page_url)}{(String(b.page_url).replace(/^https?:\/\/[^/]+/, '') || '').slice(0, 50)}</Ext>{b.title && <div className="ae-sub">{b.title}</div>}</td>
                <td>{b.anchor || '–'}</td>
                <td>{b.lost ? 'Lost' : b.dofollow ? 'Follow' : 'Nofollow'}</td>
                <td>{b.authority ?? '–'}</td>
                <td>{b.first_seen ? when(b.first_seen) : '–'}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      <section className="ae-card">
        <h3 style={{ margin: '0 0 4px' }}>Where competitors are linked and you are not</h3>
        {rep.limited || (!isPaid && data.paid === false) ? (
          <p className="ae-sub">Upgrade to see the sites that link to your competitors but not to you, with a to-do list, outreach template and link checker. The free plan shows your summary and top 5 backlinks.</p>
        ) : gap.length === 0 ? (
          <p className="ae-sub">{rep.gap_note || 'No gaps found right now.'}</p>
        ) : (
          <>
            <p className="ae-sub" style={{ margin: '0 0 10px' }}>{done} of {gap.length} won. Ask the strongest sites first. Set a status as you go, and verify each link once it is live.</p>
            {gap.map(g => (
              <GapRow key={g.domain} row={g} st={bs[keyOf(g.domain)] || {}} company={company} site={site} verifying={verifying}
                onStatus={(d, v) => setEntry(d, { status: v })} onNote={(d, v) => setEntry(d, { note: v })} onVerify={verify} />
            ))}
          </>
        )}
      </section>
    </>
  );
}
