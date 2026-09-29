import { JsonLd } from '../../../components/JsonLd';
import { buildFaqPageSchema } from '../schema';

const FAQ_ITEMS = [
  {
    question: 'What is the difference between AEO and SEO?',
    answer:
      'SEO helps your website appear in traditional search results such as Google. AEO focuses on your visibility in AI-generated answers and helping AI engines find and reference your brand. They work together, but they focus on different types of search.',
  },
  {
    question: 'Which platforms does the tool track?',
    answer:
      'The tool tracks ChatGPT, Gemini, Claude, Perplexity, Copilot, and Google. You can add more platforms as new AI search surfaces launch.',
  },
  {
    question: 'Do I need technical or SEO experience?',
    answer:
      'No. Choose your prompts and priorities. The platform runs the audit, applies supported fixes, and helps manage your content workflow.',
  },
  {
    question: 'Can it publish social media content?',
    answer:
      'Yes. Connect Facebook, Instagram, LinkedIn, Google Business Profile, and YouTube to schedule and publish content.',
  },
  {
    question: 'Can I change or cancel my plan?',
    answer:
      'Yes. You can upgrade, downgrade, or cancel your plan from the dashboard at any time.',
  },
  {
    question: 'How is my data handled?',
    answer:
      'AEO-APP.AI is an early-stage product and takes data security seriously. We can add information about encryption, access controls, permissions, and other security measures based on the current product setup.',
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
