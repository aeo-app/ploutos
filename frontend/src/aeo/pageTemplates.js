/* The page designs the customer can pick in Content Strategy.
   The ids and names are mirrored in the backend (PAGE_TEMPLATES in services/aeo_service.py) — keep the two lists in step. */
import { hostOf } from './utils';

export const PAGE_TEMPLATES = [
  { id: 'service', name: 'Service landing page', blurb: 'Bold header, benefits, how it works and a clear call to action.', bestFor: 'Customers ready to choose a service' },
  { id: 'guide', name: 'Complete guide', blurb: 'An in-depth article with key takeaways and a contents list.', bestFor: 'Questions that need a full explanation' },
  { id: 'faq', name: 'FAQ page', blurb: 'Quick, friendly answers in tap-to-open questions.', bestFor: 'Questions customers ask again and again' },
  { id: 'comparison', name: 'Comparison page', blurb: 'A side-by-side table that helps a buyer choose.', bestFor: '“Which is best?” and “how to choose” questions' },
  { id: 'location', name: 'Local area page', blurb: 'Shows the places you serve, with reasons locals choose you.', bestFor: '“Near me” and local-service questions' },
  { id: 'how_to', name: 'Step-by-step how-to', blurb: 'A numbered timeline with a “what you need” checklist.', bestFor: '“How do I…” questions' },
];

const LEGACY = { 'PILLAR PAGE': 'guide', 'FAQ CLUSTER': 'faq', COMPARISON: 'comparison', PROOF: 'service' };

export const templateById = (id) => PAGE_TEMPLATES.find(t => t.id === id) || null;

/** The template id for a strategy suggestion — also understands strategies saved before the designs existed. */
export const templateOfSuggestion = (p) => {
  if (p?.template && templateById(p.template)) return p.template;
  const t = String(p?.type || '').trim();
  return LEGACY[t.toUpperCase()] || PAGE_TEMPLATES.find(x => x.name.toLowerCase() === t.toLowerCase())?.id || '';
};

export const slugify = (text, n = 70) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '');

/** Same shape as the server's cache key — one page per (question, template, title). */
export const pageKey = (prompt, template, title) => `${prompt}|${String(template).toUpperCase()}|${slugify(title, 50)}`;

const cap = (s) => String(s || '').replace(/[?.!]+$/, '').trim().replace(/^./, c => c.toUpperCase());

export const defaultTitle = (template, prompt) => {
  const q = String(prompt || '').replace(/[?.!]+$/, '').trim();
  switch (template) {
    case 'faq': return `Frequently asked questions: ${q}`;
    case 'comparison': return `How to choose: ${q}`;
    case 'how_to': return `How to: ${q}`;
    case 'location': return `${cap(q)} (local area)`;
    case 'service': return cap(q);
    default: return `The complete guide to ${q}`;
  }
};

/** The address a page will have on the customer's own site. */
export const pageLink = (siteUrl, slug) => {
  const host = hostOf(siteUrl);
  return host && slug ? `https://${host}/${slug}` : slug ? `/${slug}` : '';
};

/** Stand-in text so each design can be previewed before anything is written. Always generic, never presented as the customer's facts. */
export function sampleContent(template, { prompt = 'your question', company = 'Your business' } = {}) {
  const q = cap(prompt) || 'Your question';
  const base = {
    template, title: q, headline: q, eyebrow: 'Sample preview',
    intro: `A clear, friendly answer to “${String(prompt).replace(/[?.!]+$/, '')}”, written for customers who are ready to choose.`,
    highlights: [
      { title: 'Clear, honest pricing', text: 'No surprises. You know the cost before we start.' },
      { title: 'Experienced team', text: 'Trained people who do this every day.' },
      { title: 'Fast response', text: 'We reply quickly and keep you updated.' },
      { title: 'Satisfaction promise', text: 'We make it right if anything is not perfect.' },
    ],
    steps: [
      { title: 'Tell us what you need', text: 'A quick call or message is all it takes.' },
      { title: 'Get a clear quote', text: 'We explain the options in plain words.' },
      { title: 'We do the work', text: 'On time, with care.' },
      { title: 'Enjoy the result', text: 'We check you are happy before we finish.' },
    ],
    sections: [
      { h: 'Why choose ' + company, p: 'This is where your real strengths appear: your experience, your approach and what makes customers trust you.\n\nEvery page is written from your website and your strategy.' },
      { h: 'Who we help', p: 'Homes, families and businesses who want the job done well, without the stress.' },
    ],
    faqs: [
      { q: 'How much does it cost?', a: 'We give a clear quote after a short conversation, so you know exactly what to expect.' },
      { q: 'How quickly can you start?', a: 'Usually within a few days. Contact us to check availability.' },
      { q: 'Do you offer a guarantee?', a: 'Yes. If something is not right, we fix it.' },
    ],
    areas: [], table: null,
    cta: { headline: 'Ready to get started?', text: 'Get in touch today and we will help you with the next step.', button: 'Get a free quote' },
  };
  switch (template) {
    case 'guide': return { ...base, eyebrow: 'The complete guide', steps: [], sections: [
      { h: 'The short answer', p: 'Start with the direct answer, so readers and AI engines get what they need straight away.' },
      { h: 'What to know first', p: 'Explain the basics in plain language, one idea at a time.' },
      { h: 'How to choose well', p: 'Give practical advice your customers can act on.' },
      { h: 'Common mistakes to avoid', p: 'Help readers avoid the problems you see most often.' }] };
    case 'faq': return { ...base, eyebrow: 'Your questions', steps: [], sections: [], highlights: [{ title: 'Reply within 1 day' }, { title: 'Free advice' }, { title: 'No obligation' }],
      faqs: [...base.faqs, { q: 'Can I get a free quote?', a: 'Of course. Tell us what you need and we will come back to you.' }, { q: 'Where do you work?', a: 'We serve your area and nearby. Ask us if you are not sure.' }] };
    case 'comparison': return { ...base, eyebrow: 'How to choose', steps: [], table: { headers: ['What to compare', 'Do it yourself', 'Basic provider', company], rows: [
      ['Cost', 'Lowest upfront', 'Mid-range', 'Clear, fair pricing'], ['Time', 'Most of your time', 'Depends', 'Fast and managed'],
      ['Experience', 'Learning as you go', 'Varies', 'Specialists'], ['Guarantee', 'None', 'Sometimes', 'Included']] }, sections: [{ h: 'How to decide', p: 'Match the option to your budget, your time and how much risk you are comfortable with.' }] };
    case 'location': return { ...base, eyebrow: 'Serving your area', steps: [], areas: ['Central', 'North', 'South', 'East', 'West', 'Nearby towns', 'City centre', 'Suburbs'],
      sections: [{ h: 'What we do in the area', p: 'We know the area, the people and what local customers need.' }] };
    case 'how_to': return { ...base, eyebrow: 'Step by step', highlights: [{ title: 'About an hour', text: 'Set aside a little time.' }, { title: 'Basic tools', text: 'Nothing special needed.' }, { title: 'This guide', text: 'Follow each step in order.' }],
      sections: [{ h: 'Common mistakes', p: 'Most problems come from rushing the first step. Take your time.' }, { h: 'When to call a professional', p: 'If anything feels unsafe or unclear, ask an expert.' }] };
    default: return base;
  }
}
