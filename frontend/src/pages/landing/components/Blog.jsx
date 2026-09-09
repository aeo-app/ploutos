import { Arrow } from './icons.jsx';

const POSTS = [
  { cat: 'Field notes', date: 'May 19, 2026', title: "Why your H1 doesn't matter to ChatGPT anymore",
    excerpt: "After auditing 4,200 sites we learned that paragraph two, not the headline, decides whether you're cited.", read: '7 min read' },
  { cat: 'Benchmarks', date: 'May 11, 2026', title: 'The 2026 AEO benchmark report (Q1)',
    excerpt: 'Average visibility across SaaS, DTC and fintech — and which schema patterns moved the needle.', read: '14 min read' },
  { cat: 'Tactics', date: 'Apr 29, 2026', title: 'Prompt clustering for buyer intent, the right way',
    excerpt: 'Stop ranking for adjectives. Start ranking for the actual sentence your buyer types into the box.', read: '9 min read' }
];

export default function Blog() {
  return (
    <section className="section" id="blog">
      <div className="section-head">
        <div className="section-eyebrow"><span className="mono">08</span><span>From the journal</span></div>
        <h2 className="section-title">What's happening at <em>aeo-app.</em></h2>
      </div>
      <div className="posts">
        {POSTS.map((p, i) => (
          <a className="post" href="#" key={p.title}>
            <div className="post-thumb" data-i={i} />
            <div className="post-body">
              <div className="post-meta">
                <span>{p.cat}</span><span>·</span><span>{p.date}</span><span>·</span><span>{p.read}</span>
              </div>
              <h3 className="post-title">{p.title}</h3>
              <p className="post-ex">{p.excerpt}</p>
              <span className="post-read">Read article <Arrow size={12} /></span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
