import { scrollToSection } from '../scrollUtils';

function FootCol({ title, links }) {
  return (
    <div>
      <p className="foot-title">{title}</p>
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
    <footer className="ln-footer">
      <div className="foot-in">
        <div className="foot-grid">
          <div>
            <p className="foot-brand">AEO App</p>
            <address>2 Ang Mo Kio Street 64, #02-03A<br />Econ Building<br />Singapore 569084</address>
          </div>
          <FootCol title="Product" links={[
            { label: 'Content studio', href: '#studio', section: 'studio' },
            { label: 'Features', href: '#features', section: 'features' },
            { label: 'Pricing', href: '#pricing', section: 'pricing' },
          ]} />
          <FootCol title="Company" links={[
            { label: 'About', href: '#' },
            { label: 'Blog', href: '/blog' },
            { label: 'Contact', href: '#cta', section: 'cta' },
          ]} />
          <FootCol title="Legal" links={[
            { label: 'Privacy policy', href: '/privacy/privacy-policy.html' },
            { label: 'Terms of service', href: '/privacy/privacy-policy.html' },
          ]} />
        </div>
        <p className="foot-bottom">© 2026 AEO App. All rights reserved.</p>
      </div>
    </footer>
  );
}
