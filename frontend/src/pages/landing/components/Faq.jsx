import { JsonLd } from '../../../components/JsonLd';
import { buildFaqPageSchema } from '../schema';

const FAQ_ITEMS = [
  {
    question: 'What content does AEO App create?',
    answer:
      'Blog articles, images, social posters, carousels, short videos and reels, LinkedIn posts and Google Business Profile updates, all based on the questions your customers ask and written in your brand voice.',
  },
  {
    question: 'Can I review posts before they go live?',
    answer:
      'Yes. Choose full autopilot, or approve each post with one tap. You can edit any caption or image before it publishes.',
  },
  {
    question: 'Which channels do you post to?',
    answer:
      'Google Business Profile, Instagram, Facebook, YouTube (including Shorts) and LinkedIn. Connect each account once and we handle the rest.',
  },
  {
    question: 'What is AEO, and why does it matter?',
    answer:
      'AEO (answer engine optimisation) helps your business get named when people ask ChatGPT, Gemini or Google’s AI Overviews for a recommendation. You can rank on Google and still be invisible to AI. We track and close that gap.',
  },
  {
    question: 'Do I need marketing or technical experience?',
    answer:
      'No. We explain everything in plain language and fix most website issues automatically.',
  },
  {
    question: 'How does billing work?',
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
    <section id="faq" className="sec">
      <JsonLd data={buildFaqPageSchema(FAQ_ITEMS)} />
      <div className="sec-in narrow">
        <div className="sec-head center">
          <p className="eyebrow">FAQ</p>
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
