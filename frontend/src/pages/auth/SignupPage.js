import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { authApi, withTokenExpiry } from '../../api/authApi';
import { PasswordRequirementsChecklist, isPasswordValid, firstUnmetPasswordRequirement } from './PasswordRequirements';
import { PasswordInput } from './PasswordInput';
import s from './Auth.module.css';

function validate(name, email, password, confirmPassword, companyName, domain) {
  if (!name.trim())                    return 'Full name is required';
  if (name.trim().length < 2)          return 'Name must be at least 2 characters';
  if (!email.trim())                   return 'Email address is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  if (!password.trim())                return 'Password is required';
  if (!isPasswordValid(password))      return `Password needs: ${firstUnmetPasswordRequirement(password)}`;
  if (password !== confirmPassword)    return 'Passwords do not match';
  if (!companyName.trim())             return 'Company name is required';
  if (!domain.trim())                  return 'Your company domain/website is required';
  return null;
}

export function SignupPage() {
  const { login, goScreen, setPending } = useAuth();
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName,     setCompanyName]     = useState('');
  const [domain,          setDomain]          = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [touched,         setTouched]         = useState({
    name: false, email: false, password: false, confirmPassword: false, companyName: false, domain: false,
  });

  const nameErr = touched.name && !name.trim() ? 'Full name is required' : '';
  const emailErr = touched.email && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ? (!email.trim() ? 'Email is required' : 'Enter a valid email')
    : '';
  const passwordErr = touched.password && (!password.trim() || !isPasswordValid(password))
    ? (!password.trim() ? 'Password is required' : `Password needs: ${firstUnmetPasswordRequirement(password)}`)
    : '';
  const confirmPasswordErr = touched.confirmPassword && (!confirmPassword.trim() || password !== confirmPassword)
    ? (!confirmPassword.trim() ? 'Confirm password is required' : 'Passwords do not match')
    : '';
  const companyNameErr = touched.companyName && !companyName.trim() ? 'Company name is required' : '';
  const domainErr = touched.domain && !domain.trim() ? 'Your company domain/website is required' : '';

  const handleSubmit = async e => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true, companyName: true, domain: true });
    const err = validate(name, email, password, confirmPassword, companyName, domain);
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const data = await withTokenExpiry(authApi.signup({
        full_name: name.trim(), email: email.trim(), password,
        company_name: companyName.trim(), domain: domain.trim(),
      }), { goScreen });
      setPending(email.trim(), name.trim(), password);
      goScreen('signup-verify');
    } catch (e) {
      // Only show error if not TokenExpired (withTokenExpiry already handles redirect)
      if (e.code !== 'TokenExpired') {
        if (e.code === 'UsernameExistsException') {
          setError('This email is already registered. Please sign in to your account instead.');
        } else if (e.code === 'InvalidPasswordException') {
          setError(e.message || "Password doesn't meet the requirements below.");
        } else if (e.code === 'ValidationError') {
          setError(e.message || 'Please check your input and try again.');
        } else if (e.code === 'NetworkError') {
          setError('Network error. Please check your connection and try again.');
        } else {
          setError(e.message || 'An error occurred during signup. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Badge */}
      <div className={s.cardBadge}>
        <span className={s.cardBadgeDot} />
        Free account · No credit card
      </div>

      <h1 className={s.cardTitle}>Create your account</h1>
      <p className={s.cardSub}>Start unlocking SEO intelligence for your market — takes 30 seconds.</p>

      {/* Security note */}
      <div className={s.passwordlessStrip}>
        <span className={s.stripIcon}>🔒</span>
        <span className={s.stripText}>
          <strong>Secure & encrypted.</strong> Your password is protected and encrypted at all times.
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className={s.fields}>
          {/* Full name */}
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Full Name<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              autoFocus
              value={name}
              placeholder="Jane Smith"
              className={`${s.input} ${nameErr ? s.inputError : ''}`}
              onChange={e => setName(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, name: true }))}
              disabled={loading}
              aria-invalid={!!nameErr}
            />
            {nameErr && <div className={s.fieldErr}>⚠ {nameErr}</div>}
          </div>

          {/* Company name */}
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Company Name<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="text"
              autoComplete="organization"
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

          {/* Domain — locked to this account permanently, one domain per account */}
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

          {/* Email */}
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Email Address<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              placeholder="jane@company.com"
              className={`${s.input} ${emailErr ? s.inputError : ''}`}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, email: true }))}
              disabled={loading}
              aria-invalid={!!emailErr}
            />
            {emailErr && <div className={s.fieldErr}>⚠ {emailErr}</div>}
          </div>

          {/* Password */}
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Password<span className={s.fieldRequired}>*</span>
            </label>
            <PasswordInput
              autoComplete="new-password"
              value={password}
              placeholder="Enter password (min. 8 characters)"
              className={`${s.input} ${passwordErr ? s.inputError : ''}`}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setTouched(p => ({ ...p, password: true }))}
              onBlur={() => setTouched(p => ({ ...p, password: true }))}
              disabled={loading}
              aria-invalid={!!passwordErr}
            />
            {touched.password && <PasswordRequirementsChecklist password={password} />}
          </div>

          {/* Confirm Password */}
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Confirm Password<span className={s.fieldRequired}>*</span>
            </label>
            <PasswordInput
              autoComplete="new-password"
              value={confirmPassword}
              placeholder="Confirm your password"
              className={`${s.input} ${confirmPasswordErr ? s.inputError : ''}`}
              onChange={e => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched(p => ({ ...p, confirmPassword: true }))}
              disabled={loading}
              aria-invalid={!!confirmPasswordErr}
            />
            {confirmPasswordErr && <div className={s.fieldErr}>⚠ {confirmPasswordErr}</div>}
          </div>
        </div>

        {/* Global error */}
        {error && !nameErr && !emailErr && !passwordErr && !confirmPasswordErr && (
          <motion.div
            className={s.fieldErr}
            style={{ marginBottom: 14 }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            ⚠ {error}
          </motion.div>
        )}

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account →'}
        </Button>
      </form>

      <p className={s.switchRow}>
        Already have an account?{' '}
        <button className={s.switchLink} onClick={() => goScreen('login')} type="button">
          Sign in
        </button>
      </p>

      <p className={s.terms}>
        By creating an account you agree to our{' '}
        <span className={s.termsLink}>Terms of Service</span> and{' '}
        <span className={s.termsLink}>Privacy Policy</span>.
      </p>
    </AuthLayout>
  );
}
