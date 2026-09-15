import { useState } from 'react';
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
    question: 'How does billing work, and is it a subscription?',
    answer:
      "Plans are billed annually and renew automatically using the payment method on file, so your access continues without interruption. You can cancel automatic renewal at any time from your billing settings — cancelling stops future charges but doesn't cut off the access you've already paid for; it simply won't renew into a new period.",
  },
  {
    question: "What happens if a renewal payment fails?",
    answer:
      "Your access isn't cut off immediately over a single failed charge. We retry automatically, and you'll see a clear notice in your billing settings if a payment needs attention — access only lapses if it remains unresolved through your current paid period.",
  },
  {
    question: 'Can I switch plans or cancel later?',
    answer:
      'Yes. You can upgrade, downgrade, or cancel automatic renewal at any time from your billing settings — there is no fixed contract term.',
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="section" id="faq">
      <JsonLd data={buildFaqPageSchema(FAQ_ITEMS)} />
      <div className="section-head">
        <div className="section-eyebrow"><span className="mono">09</span><span>FAQ</span></div>
        <h2 className="section-title">Questions, <em>answered.</em></h2>
      </div>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div className={`faq-item${isOpen ? ' faq-item-open' : ''}`} key={item.question}>
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
                aria-expanded={isOpen}
              >
                <span>{item.question}</span>
                <span className="faq-caret" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
              {/* Always rendered, never conditionally mounted — CSS
                  (max-height/opacity, see LandingPage.css) handles the
                  visual collapse. The FAQPage schema above describes
                  content that must actually be present in the markup a
                  non-JS crawler sees, not just content that exists after
                  a click — a conditionally-rendered answer would be
                  completely absent from that snapshot whenever collapsed,
                  which is exactly the "schema without matching visible
                  content" problem Google's guidelines warn against. */}
              <p className={`faq-answer${isOpen ? ' faq-answer-open' : ''}`}>{item.answer}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
