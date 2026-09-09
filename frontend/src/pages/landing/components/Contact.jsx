import { useState } from 'react';
import { Tick, Arrow } from './icons.jsx';

const COUNTRIES = [
  'United States', 'United Kingdom', 'India', 'Canada', 'Australia',
  'Germany', 'France', 'Singapore', 'United Arab Emirates', 'Other'
];

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
    <section className="cta-wrap" id="contact">
      <div className="cta-grid">
        <div>
          <div className="section-eyebrow"><span className="mono">08</span><span>Create your account</span></div>
          <h2 className="cta-title">
            Ready to rank where the answers <em>actually live?</em>
          </h2>
          <p className="cta-sub">
            Register with your corporate email and we'll send a one-time code to verify it. Then we
            spin up your workspace and ingest your top three competitors.
          </p>
          <ul className="cta-list">
            <li><Tick /> Full Premium plan, 14 days · everything unlocked</li>
            <li><Tick /> Includes your free $10 audit credit</li>
            <li><Tick /> Cancel from in-app, no email loop</li>
          </ul>
          <div className="cta-actions">
            <a className="btn btn-dark btn-lg" href="#audit">Start free trial <Arrow className="btn-arrow" size={13} /></a>
          </div>
        </div>
        <form className="cta-form" onSubmit={step === 'otp' ? verify : sendOtp}>
          {step === 'done' ? (
            <div className="cta-sent">
              <div className="cta-sent-mark"><Tick /></div>
              <h3>You're verified.</h3>
              <p>Welcome, {data.name || 'there'}. Workspace spinning up — check <span className="mono">{data.email}</span> for your login link.</p>
              <button className="btn btn-ghost" type="button" onClick={() => { setStep('form'); setOtp(''); }}>Register another</button>
            </div>
          ) : step === 'otp' ? (
            <>
              <h3>Verify your email</h3>
              <p className="cta-otp-note">We sent a 6-digit code to <span className="mono">{data.email}</span>. Enter it below to continue.</p>
              <div className="field"><label>One-time code</label>
                <input className="otp-input" value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="••••••" inputMode="numeric" /></div>
              <button type="submit" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
                Verify &amp; continue <Arrow className="btn-arrow" size={13} />
              </button>
              <button type="button" className="cta-otp-back" onClick={() => setStep('form')}>← Edit details</button>
            </>
          ) : (
            <>
              <h3>Create your account</h3>
              <div className="field"><label>Corporate email</label>
                <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="you@company.com" /></div>
              <div className="field"><label>Full name</label>
                <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="Hannah Lo" /></div>
              <div className="field"><label>Country</label>
                <select className="cta-select" value={data.country} onChange={(e) => setData({ ...data, country: e.target.value })}>
                  <option value="" disabled>Select your country</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
                Send verification code <Arrow className="btn-arrow" size={13} />
              </button>
              <div className="cta-fine">
                By registering you agree to our <a href="#">terms</a> and <a href="#">privacy policy</a>.
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
