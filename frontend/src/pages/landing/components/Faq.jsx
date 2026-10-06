import { JsonLd } from '../../../components/JsonLd';
import { buildFaqPageSchema } from '../schema';

const FAQ_ITEMS = [
  {
    question: 'What is AEO, and how is it different from SEO?',
    answer:
      "SEO optimizes a page to rank in a list of links on a search results page. AEO (answer engine optimization) optimizes for a different outcome: being the source an AI system actually cites or recommends when someone asks it a question directly, in tools like ChatGPT, Perplexity, or Google's AI Overviews. The two overlap, but a page can rank well in traditional search and still be invisible to AI answers, or vice versa — AEO-APP.ai tracks and improves that specific gap.",
  },
  {
    question: 'Which AI platforms does AEO-APP.ai track?',
    answer:
      'AEO-APP.ai tracks visibility across the major AI answer engines, including ChatGPT, Perplexity, and Google AI Overviews, using the actual prompts a real buyer would type — not generic keyword lists.',
  },
  {
    question: 'Do I need technical or SEO experience to use this?',
    answer:
      "No. AEO-APP.ai audits your site, explains what's missing in plain language, and can generate and schedule the fixes, blog content, and social posts for you. You can review and approve changes at any level of technical involvement you're comfortable with.",
  },
  {
    question: 'Do you post directly to my social accounts?',
    answer:
      'Yes — connect your Facebook, Instagram, LinkedIn, Google My Business and YouTube accounts once, and AEO-APP.ai schedules and publishes on your behalf.',
  },
  {
    question: 'How does billing work, and is it a subscription?',
    answer:
      "Plans are billed annually and renew automatically using the payment method on file, so your access continues without interruption. You can cancel automatic renewal at any time from your billing settings — cancelling stops future charges but doesn't cut off the access you've already paid for; it simply won't renew into a new period.",
  },
  {
    question: 'Can I switch plans or cancel later?',
    answer:
      'Yes. You can upgrade, downgrade, or cancel automatic renewal at any time from your billing settings — there is no fixed contract term.',
  },
];

export default function Faq() {
  return (
    <section id="faq">
      <JsonLd data={buildFaqPageSchema(FAQ_ITEMS)} />
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">FAQ</span>
          <h2>Questions, answered.</h2>
        </div>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <details key={item.question} open={i === 0}>
              <summary>{item.question}</summary>
              <p className="a">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
