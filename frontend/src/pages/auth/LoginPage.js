import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { Button }     from '../../components/ui/Button';
import { useAuth }    from '../../context/AuthContext';
import { authApi, withTokenExpiry }    from '../../api/authApi';
import s from './Auth.module.css';

export function LoginPage() {
  const { login, goScreen, setPending } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [touched,  setTouched]  = useState({ email: false, password: false });

  const emailErr = touched.email && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ? (!email.trim() ? 'Email is required' : 'Enter a valid email address')
    : '';

  const passwordErr = touched.password && (!password.trim() || password.length < 8)
    ? (!password.trim() ? 'Password is required' : 'Password must be at least 8 characters')
    : '';

  const handleSubmit = async e => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password.trim() || password.length < 8) return;
    setError('');
    setLoading(true);
    try {
      const data = await withTokenExpiry(authApi.login({ email: email.trim(), password }), { goScreen });
      login({ email: email.trim(), ...data?.user });
    } catch (err) {
      // Only show error if not TokenExpired (withTokenExpiry already handles redirect)
      if (err.code !== 'TokenExpired') {
        if (err.code === 'UserNotConfirmedException') {
          // Account exists but was never verified — send them to finish
          // that instead of leaving them stuck on a login error they can't
          // act on. LoginVerifyPage already exists for exactly this case,
          // it just was never actually reachable from here before.
          setPending(email.trim(), '', password);
          goScreen('login-verify');
          return;
        }
        if (err.code === 'UserNotFoundException') {
          setError('No account found with this email. Please create an account first.');
        } else if (err.code === 'NotAuthorizedException') {
          setError('Invalid email or password. Please try again.');
        } else if (err.code === 'LimitExceededException' || err.code === 'TooManyRequestsException') {
          setError('Too many attempts. Please wait a few minutes and try again.');
        } else if (err.code === 'NetworkError') {
          setError('Network error. Please check your connection and try again.');
        } else {
          setError(err.message || 'An error occurred during login. Please try again.');
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
        Secure sign in
      </div>

      <h1 className={s.cardTitle}>Welcome back</h1>
      <p className={s.cardSub}>
        Enter your email and password to sign in to your account.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={s.fields}>
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Email Address<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              placeholder="jane@company.com"
              className={`${s.input} ${emailErr || error ? s.inputError : ''}`}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              onBlur={() => setTouched(p => ({ ...p, email: true }))}
              disabled={loading}
              aria-invalid={!!(emailErr || error)}
            />
            {emailErr && <div className={s.fieldErr}>⚠ {emailErr}</div>}
          </div>

          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Password<span className={s.fieldRequired}>*</span>
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              placeholder="Enter your password"
              className={`${s.input} ${passwordErr ? s.inputError : ''}`}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onBlur={() => setTouched(p => ({ ...p, password: true }))}
              disabled={loading}
              aria-invalid={!!passwordErr}
            />
            {passwordErr && <div className={s.fieldErr}>⚠ {passwordErr}</div>}
          </div>
        </div>

        {error && (
          <motion.div className={s.fieldErr} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16 }}>
            ⚠ {error}
          </motion.div>
        )}

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in →'}
        </Button>
      </form>

      {/* Info */}
      <div className={s.passwordlessStrip} style={{ marginTop: 20, marginBottom: 0 }}>
        <span className={s.stripIcon}>🔒</span>
        <span className={s.stripText}>
          Your password is securely encrypted. Keep it confidential.
        </span>
      </div>

      <p className={s.switchRow}>
        Don't have an account?{' '}
        <button className={s.switchLink} onClick={() => goScreen('signup')} type="button">
          Create one free
        </button>
      </p>
    </AuthLayout>
  );
}
