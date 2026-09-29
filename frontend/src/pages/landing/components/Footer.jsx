import { scrollToSection } from '../scrollUtils';

function FootCol({ title, links }) {
  return (
    <div>
      <h5>{title}</h5>
      <ul>
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} onClick={l.section ? (e) => scrollToSection(l.section, e) : undefined}>{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="foot-brand">
              <span>AEO-APP.AI</span>
            </div>
            <p className="desc">Singapore · Serving customers in Singapore &amp; India.</p>
          </div>
          <FootCol title="Product" links={[
            { label: 'AEO Tracking', href: '#product', section: 'product' },
            { label: 'GEO Optimization', href: '#product', section: 'product' },
            { label: 'SEO Audit', href: '#product', section: 'product' },
            { label: 'Social Automation', href: '#product', section: 'product' },
            { label: 'Pricing', href: '#pricing', section: 'pricing' },
          ]} />
          <FootCol title="Company" links={[
            { label: 'About', href: '#' },
            { label: 'Blog', href: '/blog' },
            { label: 'Careers', href: '#' },
            { label: 'Contact', href: '#cta', section: 'cta' },
          ]} />
          <FootCol title="Legal" links={[
            { label: 'Privacy Policy', href: '/privacy/privacy-policy.html' },
            { label: 'Terms of Service', href: '/privacy/privacy-policy.html' },
          ]} />
        </div>
        <div className="foot-bottom">
          <span>© 2026 AEO-APP.AI</span>
          <span>Made for growth teams who'd rather not hire one.</span>
        </div>
      </div>
    </footer>
  );
}
