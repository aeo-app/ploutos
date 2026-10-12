import { useState } from 'react';

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
export const SIGNUP_PREFILL_KEY = 'aeo_signup_prefill';

export default function Contact({ onStart }) {
  const [data, setData] = useState({ name: '', email: '', country: '' });
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!data.email.trim() || !data.name.trim() || !data.country) { setError('Please fill in your email, name and country.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) { setError('Enter a valid work email.'); return; }
    setError('');
    try { sessionStorage.setItem(SIGNUP_PREFILL_KEY, JSON.stringify({ name: data.name.trim(), email: data.email.trim(), country: COUNTRY_CODES[data.country] || '' })); } catch (_) { /* optional */ }
    onStart?.();
  };

  return (
    <section className="dark" id="cta">
      <div className="wrap">
        <div className="cta-box">
          <span className="eyebrow">Get started</span>
          <h2>Ready to show up in the answer, not just the search results?</h2>

          <p className="cta-sub">
            Start your free AEO audit — see exactly where you stand across ChatGPT, Gemini,
            Perplexity, Copilot and Google in minutes.
          </p>
          <form onSubmit={submit}>
            <div className="form-row">
              <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="Work email" autoComplete="email" />
              <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Full name" autoComplete="name" />
              <select value={data.country} onChange={(e) => setData({ ...data, country: e.target.value })}>
                <option value="" disabled>Country</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn btn-primary">Start free audit</button>
            </div>
            {error && <p className="cta-fine" style={{ color: '#fca5a5' }} role="alert">{error}</p>}
          </form>
          <p className="cta-fine">
            By registering you agree to our <a href="/privacy/privacy-policy.html">terms</a> and <a href="/privacy/privacy-policy.html">privacy policy</a>.
          </p>

          <p className="cta-trust">No credit card required. Cancel anytime.</p>
        </div>
      </div>
    </section>
  );
}
