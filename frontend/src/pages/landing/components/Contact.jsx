import { useState } from 'react';

const COUNTRIES = [
  'Singapore', 'India', 'United States', 'United Kingdom', 'Canada',
  'Australia', 'Germany', 'France', 'United Arab Emirates', 'Other',
];

const CheckMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export default function Contact() {
  const [step, setStep] = useState('form'); // form | otp | done
  const [data, setData] = useState({ name: '', email: '', country: '' });
  const [otp, setOtp] = useState('');

  const sendOtp = (e) => {
    e.preventDefault();
    if (!data.email || !data.name || !data.country) return;
    setStep('otp');
  };
  const verify = (e) => {
    e.preventDefault();
    if (otp.length < 4) return;
    setStep('done');
  };

  return (
    <section className="dark" id="cta">
      <div className="wrap">
        <div className="cta-box">
          <span className="eyebrow">Get started</span>
          <h2>Ready to show up in the answer, not just the search results?</h2>

          {step === 'done' ? (
            <div className="cta-sent">
              <div className="cta-sent-mark"><CheckMark /></div>
              <h3>You're verified.</h3>
              <p>Welcome, {data.name || 'there'}. Workspace spinning up — check <span className="mono">{data.email}</span> for your login link.</p>
              <button type="button" className="btn btn-ghost-dark" style={{ marginTop: 18 }} onClick={() => { setStep('form'); setOtp(''); }}>
                Register another
              </button>
            </div>
          ) : step === 'otp' ? (
            <form onSubmit={verify}>
              <p className="cta-sub">We sent a 6-digit code to <span className="mono">{data.email}</span>. Enter it below to continue.</p>
              <div className="form-row">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="••••••" inputMode="numeric" autoComplete="off"
                />
                <button type="submit" className="btn btn-primary">Verify &amp; continue</button>
              </div>
              <button type="button" className="cta-back" onClick={() => setStep('form')}>&larr; Edit details</button>
            </form>
          ) : (
            <>
              <p className="cta-sub">
                Start your free AEO audit and see where your brand stands across ChatGPT, Gemini,
                Perplexity, Copilot, and Google.
              </p>
              <form onSubmit={sendOtp}>
                <div className="form-row">
                  <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="Work email" autoComplete="off" />
                  <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Full name" autoComplete="off" />
                  <select value={data.country} onChange={(e) => setData({ ...data, country: e.target.value })}>
                    <option value="" disabled>Country</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="submit" className="btn btn-primary">Start free audit</button>
                </div>
              </form>
              <p className="cta-fine">
                By registering you agree to our <a href="#">terms</a> and <a href="#">privacy policy</a>.
              </p>
            </>
          )}

          <p className="cta-trust">No credit card required. Cancel anytime.</p>
        </div>
      </div>
    </section>
  );
}
