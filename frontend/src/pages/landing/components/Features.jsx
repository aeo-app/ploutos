import { SectionHead } from './ui';

const ICON = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

const FEATURES = [
  { title: 'Images & posters', text: 'On-brand visuals for every post, created from your business and services. No designer needed.',
    icon: <svg {...ICON}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg> },
  { title: 'Reels & short videos', text: 'Script, voiceover, captions and cover, made for Instagram, Facebook and YouTube Shorts.',
    icon: <svg {...ICON}><rect x="2" y="5" width="15" height="14" rx="2" /><path d="M22 8l-5 4 5 4z" /></svg> },
  { title: 'Blogs & social posts', text: 'Articles and captions that answer what customers ask, written in your brand voice.',
    icon: <svg {...ICON}><path d="M17 20H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h4" /></svg> },
  { title: 'Auto-posting everywhere', text: 'Google Business Profile, Instagram, Facebook, YouTube and LinkedIn, on schedule, with optional approval.',
    icon: <svg {...ICON}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg> },
  { title: 'AI search visibility', text: 'Track where ChatGPT, Gemini, Perplexity, Copilot and Google recommend you, and why competitors win.',
    icon: <svg {...ICON}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg> },
  { title: 'Website fixes & backlinks', text: 'We fix technical issues automatically and build the trusted links that lift your ranking.',
    icon: <svg {...ICON}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg> },
];

export default function Features() {
  return (
    <section id="features" className="sec">
      <div className="sec-in">
        <SectionHead eyebrow="What you get" title="A full marketing team, without the hiring."
          lead="Content, posting and search visibility, working together in one place." />
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              {f.icon}
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
