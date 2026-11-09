import { SectionHead } from './ui';

const STEPS = [
  { title: 'Audit & discover', text: 'We study your website, your competitors and the questions your customers ask Google and AI.' },
  { title: 'Create content', text: 'We turn those questions into blogs, images, posters and reels, in your brand style.' },
  { title: 'Auto-publish', text: 'Posts go out on schedule to every channel, automatically or after you tap approve.' },
  { title: 'Track & grow', text: 'Watch your AI visibility and bookings grow, and see which content brings in guests.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="sec">
      <div className="sec-in">
        <SectionHead center eyebrow="How it works" title="From your website to a complete marketing plan, in four steps."
          lead="We handle the whole process, so you can focus on running your business." />
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <div className="step-top"><span className="num" aria-hidden="true">{i + 1}</span><h3>{s.title}</h3></div>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
