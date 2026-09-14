import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import s from './Auth.module.css';

const COUNTRY_OPTIONS = [
  ['SG', 'Singapore'], ['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['CA', 'Canada'], ['AE', 'United Arab Emirates'],
  ['MY', 'Malaysia'], ['ID', 'Indonesia'], ['PH', 'Philippines'], ['TH', 'Thailand'],
  ['JP', 'Japan'], ['CN', 'China'], ['HK', 'Hong Kong'], ['CH', 'Switzerland'],
];

/**
 * Shown once for accounts that signed up before company_name/domain were
 * required. Blocks everything else — same "restricted content needs
 * something first" principle as the payment gate, just for profile data
 * instead of payment. Calls authApi.setProfile() (backend also locks the
 * domain in the one-to-one user<->domain mapping in the same call).
 */
export function CompleteProfilePage({ profile, onComplete }) {
  const { logout } = useAuth();
  const [companyName, setCompanyName] = useState(profile?.company_name || '');
  const [domain, setDomain] = useState(profile?.domain || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ companyName: false, domain: false, country: false });

  const companyNameErr = touched.companyName && !companyName.trim() ? 'Company name is required' : '';
  const domainErr = touched.domain && !domain.trim() ? 'Your company domain/website is required' : '';
  const countryErr = touched.country && !country ? 'Country is required' : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ companyName: true, domain: true, country: true });
    if (!companyName.trim() || !domain.trim() || !country) return;
    setError('');
    setLoading(true);
    try {
      const savedProfile = await authApi.setProfile({ company_name: companyName.trim(), domain: domain.trim(), country });
      onComplete(savedProfile);
    } catch (e2) {
      setError(e2.message || 'Could not save your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className={s.cardBadge}>
        <span className={s.cardBadgeDot} />
        One-time setup
      </div>

      <h1 className={s.cardTitle}>Complete your profile</h1>
      <p className={s.cardSub}>
        We need your company name and domain to personalise your reports — this only takes a moment.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={s.fields}>
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Company Name<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="text"
              autoComplete="organization"
              autoFocus
              value={companyName}
              placeholder="Acme Relocation"
              className={`${s.input} ${companyNameErr ? s.inputError : ''}`}
              onChange={e => setCompanyName(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, companyName: true }))}
              disabled={loading}
              aria-invalid={!!companyNameErr}
            />
            {companyNameErr && <div className={s.fieldErr}>⚠ {companyNameErr}</div>}
          </div>

          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Country<span className={s.fieldRequired}>*</span>
            </label>
            <select
              autoComplete="country"
              value={country}
              className={`${s.input} ${countryErr ? s.inputError : ''}`}
              onChange={e => setCountry(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, country: true }))}
              disabled={loading}
              aria-invalid={!!countryErr}
            >
              <option value="">Select your country</option>
              {COUNTRY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            {countryErr && <div className={s.fieldErr}>⚠ {countryErr}</div>}
          </div>

          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Company Website / Domain<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="text"
              autoComplete="url"
              value={domain}
              placeholder="acmerelocation.com"
              className={`${s.input} ${domainErr ? s.inputError : ''}`}
              onChange={e => setDomain(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, domain: true }))}
              disabled={loading}
              aria-invalid={!!domainErr}
            />
            {domainErr && <div className={s.fieldErr}>⚠ {domainErr}</div>}
            <div style={{ fontSize: 11.5, color: 'var(--c-slate-400)', marginTop: 4 }}>
              One domain per account — this can't be changed later, so double-check it's right.
            </div>
          </div>
        </div>

        {error && (
          <motion.div className={s.fieldErr} style={{ marginBottom: 14 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            ⚠ {error}
          </motion.div>
        )}

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
          {loading ? 'Saving…' : 'Continue →'}
        </Button>
      </form>

      <p className={s.switchRow}>
        <button className={s.switchLink} onClick={logout} type="button">Sign out instead</button>
      </p>
    </AuthLayout>
  );
}
