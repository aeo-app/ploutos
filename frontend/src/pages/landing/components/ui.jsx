// Small shared pieces for the landing page.
export const CheckIcon = ({ size = 18 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export function SectionHead({ eyebrow, title, lead, center }) {
  return (
    <div className={'sec-head' + (center ? ' center' : '')}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}
