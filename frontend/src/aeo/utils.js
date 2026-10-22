// Shared constants + pure helpers for the AEO dashboard screens.
export const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini', 'AI Overviews'];
export const ENG_SHORT = ['GPT', 'PPLX', 'GEM', 'AIO'];
export const INTENT = { Commercial: ['#eef0ff', '#3730a3'], Informational: ['#e0f2fe', '#075985'], Transactional: ['#fff1e6', '#9a3412'] };

export const CHANNELS = [
  { id: 'fb',  name: 'Facebook',        abbr: 'f',  bg: '#e0ecff', fg: '#1d4ed8', day: 0, aspect: '1.91', time: '9:00 AM',  platform: 'facebook' },
  { id: 'ig',  name: 'Instagram',       abbr: 'IG', bg: '#fce7f3', fg: '#9d174d', day: 2, aspect: '1',    time: '12:30 PM', platform: 'instagram' },
  { id: 'li',  name: 'LinkedIn',        abbr: 'in', bg: '#dbeafe', fg: '#1e3a8a', day: 1, aspect: '1.91', time: '8:30 AM',  platform: 'linkedin' },
  { id: 'yt',  name: 'YouTube',         abbr: 'YT', bg: '#fee2e2', fg: '#991b1b', day: 3, aspect: '1.778', time: '7:00 PM', platform: 'youtube' },
  { id: 'gbp', name: 'Google Business', abbr: 'G',  bg: '#fef3c7', fg: '#92400e', day: 4, aspect: '1.333', time: '10:00 AM', platform: 'google_business' },
];
/** Connection state of one channel for the customer. A connection that did not complete shows as "in progress", never as an error. */
export const channelState = (c, st, inProgress) => {
  if (st?.connected && !st?.needs_reconnect) return { key: 'on', label: '● Connected', color: '#059669' };
  if (st?.needs_reconnect) return { key: 'reconnect', label: '● Reconnect needed', color: '#b45309' };
  if (inProgress) return { key: 'progress', label: '◐ In progress', color: '#4f46e5' };
  return { key: 'off', label: '○ Not connected', color: '#64748b' };
};

export const SOCIAL_HELP = {
  li:  { label: 'LinkedIn', placeholder: 'https://linkedin.com/company/your-page' },
  gbp: { label: 'Google Business Profile', placeholder: 'https://g.page/your-business' },
  fb:  { label: 'Facebook', placeholder: 'https://facebook.com/your-page' },
  ig:  { label: 'Instagram', placeholder: 'https://instagram.com/your-handle or @handle' },
  yt:  { label: 'YouTube', placeholder: 'https://youtube.com/@your-channel' },
};
export const SOCIAL_ORDER = ['li', 'gbp', 'fb', 'ig', 'yt'];
export const TINTS = [['#eef0ff', '#e4e7ff'], ['#e8f6f0', '#dcefe6'], ['#fff4e6', '#ffead1'], ['#f3eefe', '#e9e0fd']];

// "Engine presence": n>0 cited at position n, -1 mentioned, 0 absent, null pending.
export function engCell(x, j) {
  const title = ENGINES[j] + ': ' + (x == null ? 'pending next run' : x > 0 ? 'cited at position ' + x : x < 0 ? 'mentioned, not linked' : 'absent');
  if (x == null) return { cls: 'pend', label: '…', title };
  if (x > 0) return { cls: 'cited', label: '#' + x, title };
  if (x < 0) return { cls: 'ment', label: 'M', title };
  return { cls: 'abs', label: '–', title };
}

const score = (x) => (x > 0 ? (6 - Math.min(x, 5)) / 5 : x < 0 ? 0.3 : 0);
export const isReal = (p) => p && !p.locked && Array.isArray(p.engines) && !p.engines.some(e => e == null);
export const promptVis = (p) => Math.round((p.engines.reduce((a, x) => a + score(x), 0) / 4) * 100);

export function overallVis(prompts) {
  const real = (prompts || []).filter(isReal);
  if (!real.length) return null;
  return Math.round(real.reduce((a, p) => a + promptVis(p), 0) / real.length);
}
export function citedCount(prompts) {
  return (prompts || []).filter(isReal).reduce((a, p) => a + p.engines.filter(x => x > 0).length, 0);
}
export function youSov(analysis) {
  const me = (analysis?.competitors || []).find(c => c.is_you);
  return me ? me.share_of_voice : null;
}
export function sovRank(analysis) {
  const comps = (analysis?.competitors || []).filter(c => !c.pending);
  const me = comps.find(c => c.is_you);
  if (!me) return null;
  return { rank: [...comps].sort((a, b) => b.share_of_voice - a.share_of_voice).findIndex(c => c.is_you) + 1, of: comps.length };
}

export function engineStats(prompts, j) {
  const real = (prompts || []).filter(isReal);
  const xs = real.map(p => p.engines[j]);
  const cited = xs.filter(x => x > 0);
  const mentioned = xs.filter(x => x < 0).length;
  const vis = xs.length ? Math.round((xs.reduce((a, x) => a + score(x), 0) / xs.length) * 100) : 0;
  const gaps = real.filter(p => p.engines[j] === 0).sort((a, b) => b.volume_estimate - a.volume_estimate).slice(0, 3);
  return {
    vis, cited: cited.length, mentioned, absent: xs.length - cited.length - mentioned,
    avg: cited.length ? '#' + (cited.reduce((a, b) => a + b, 0) / cited.length).toFixed(1) : '—', gaps,
  };
}

export const hostOf = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
export const fmtDate = (d, o) => d.toLocaleDateString('en-GB', o);
export const num = (n) => Number(n || 0).toLocaleString();

// Calendar: 4 weeks starting on the next Monday on/after today.
export function calendarStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (8 - d.getDay()) % 7; // days until Monday (0 if today is Monday)
  d.setDate(d.getDate() + add);
  return d;
}
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const copyToClipboard = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } };

export const BLOG_TAG = {
  ai: ['AI generated', '#eef0ff', '#3730a3'],
  pending: ['Team review requested', '#fef3c7', '#92400e'],
  idea: ['Topic idea', '#f1f1f7', '#4a4966'],
  edited: ['Edited by our team', '#e0f2fe', '#075985'],
  verified: ['Verified by our team', '#d1fae5', '#065f46'],
};

// Short stable key for saved per-item state (blogs, posts) — shared by the customer and admin screens.
export const hkey = (...parts) => {
  const s = parts.join('\u0001');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
