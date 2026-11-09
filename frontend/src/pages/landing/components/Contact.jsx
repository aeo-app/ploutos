import { useState } from 'react';
import { setSignupPrefill } from '../prefill';

const COUNTRIES = [
  'Singapore', 'India', 'United States', 'United Kingdom', 'Canada',
  'Australia', 'Germany', 'France', 'United Arab Emirates', 'Other',
];

const COUNTRY_CODES = {
  'Singapore': 'SG', 'India': 'IN', 'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA',
  'Australia': 'AU', 'Germany': '', 'France': '', 'United Arab Emirates': 'AE', 'Other': '',
};

// The details typed here are handed to the real sign-up form (which creates the
// account and sends the verification code), instead of being collected twice.
export default function Contact({ onStart }) {
  const [data, setData] = useState({ site: '', name: '', email: '', country: '' });
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!data.email.trim() || !data.name.trim() || !data.country) { setError('Please fill in your email, name and country.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) { setError('Enter a valid work email.'); return; }
    setError('');
    setSignupPrefill({ name: data.name, email: data.email, country: COUNTRY_CODES[data.country] || '', domain: data.site });
    onStart?.();
  };

  return (
    <section className="cta-sec" id="cta">
      <div className="cta-in">
        <div className="cta-copy">
          <h2>See what AEO App can create for your business.</h2>
          <p>Free audit and 1 week of content, ready in about 60 seconds. No credit card.</p>
        </div>
        <div className="cta-card">
          <form onSubmit={submit} noValidate>
            <div className="cta-fields">
              <div className="full">
                <label htmlFor="site-cta" className="sr-only">Your website address</label>
                <input id="site-cta" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck="false" autoComplete="url"
                  value={data.site} onChange={(e) => setData({ ...data, site: e.target.value })} placeholder="yourbusiness.com (optional)" />
              </div>
              <div>
                <label htmlFor="email-cta" className="sr-only">Work email</label>
                <input id="email-cta" type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="Work email" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="name-cta" className="sr-only">Full name</label>
                <input id="name-cta" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Full name" autoComplete="name" />
              </div>
              <div className="full">
                <label htmlFor="country-cta" className="sr-only">Country</label>
                <select id="country-cta" value={data.country} onChange={(e) => setData({ ...data, country: e.target.value })}>
                  <option value="" disabled>Country</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg block">Get my free audit</button>
            {error && <p className="cta-error" role="alert">{error}</p>}
          </form>
          <p className="cta-fine">
            By registering you agree to our <a href="/privacy/privacy-policy.html">terms</a> and <a href="/privacy/privacy-policy.html">privacy policy</a>. No credit card required. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
}
