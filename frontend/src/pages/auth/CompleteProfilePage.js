import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import s from './Auth.module.css';

/**
 * Shown once for accounts that signed up before company_name/domain were
 * required. Blocks everything else — same "restricted content needs
 * something first" principle as the payment gate, just for profile data
 * instead of payment. Calls authApi.setProfile() (backend also locks the
 * domain in the one-to-one user<->domain mapping in the same call).
 */
export function CompleteProfilePage({ onComplete }) {
  const { logout } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ companyName: false, domain: false });

  const companyNameErr = touched.companyName && !companyName.trim() ? 'Company name is required' : '';
  const domainErr = touched.domain && !domain.trim() ? 'Your company domain/website is required' : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ companyName: true, domain: true });
    if (!companyName.trim() || !domain.trim()) return;
    setError('');
    setLoading(true);
    try {
      const profile = await authApi.setProfile({ company_name: companyName.trim(), domain: domain.trim() });
      onComplete(profile);
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
