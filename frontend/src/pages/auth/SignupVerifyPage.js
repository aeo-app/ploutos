import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { OTPBoxes }   from './OTPBoxes';
import { Button }     from '../../components/ui/Button';
import { useAuth }    from '../../context/AuthContext';
import { authApi, withTokenExpiry }    from '../../api/authApi';
import s from './Auth.module.css';

export function SignupVerifyPage() {
  const { auth, goScreen, login } = useAuth();
  const email   = auth.pendingEmail;
  const name    = auth.pendingName;
  const password = auth.pendingPassword;
  const masked  = email.replace(/(.{2}).+(@.+)/, '$1***$2');

  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const resetRef = useRef(null);

  const handleComplete = val => setCode(val);

  const handleVerify = async () => {
    if (code.length < 6) { setError('Enter all 6 digits'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await withTokenExpiry(authApi.verifyEmail({ email, code }), { goScreen });
      const userData = await authApi.login({ email, password });
      setSuccess(true);
      setTimeout(() => login({ name, email, ...data?.user }), 1200);
    } catch (e) {
      // Only show error if not TokenExpired (withTokenExpiry already handles redirect)
      if (e.code !== 'TokenExpired') {
        if (e.code === 'InvalidCode' || e.code === 'CodeExpired') {
          setError(e.message || 'Invalid or expired verification code. Please try again.');
          resetRef.current?.();
        } else {
          setError(e.message || 'Verification failed. Please try again.');
          resetRef.current?.();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setError('');
      await withTokenExpiry(authApi.resendCode({ email, type: 'signup' }), { goScreen });
      setError('Verification code resent! Check your email.');
      setTimeout(() => setError(''), 3000);
    } catch (e) {
      // Only show error if not TokenExpired (withTokenExpiry already handles redirect)
      if (e.code !== 'TokenExpired') {
        setError(e.message || 'Failed to resend code. Please try again.');
      }
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <motion.div className={s.successWrap} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.div className={s.successRing} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: 2, duration: 0.5 }}>
            ✓
          </motion.div>
          <div className={s.successTitle}>Email verified!</div>
          <div className={s.successSub}>Welcome aboard, {name || 'there'} — taking you to your dashboard…</div>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Badge */}
      <div className={s.cardBadge}>
        <span className={s.cardBadgeDot} />
        Step 2 of 2 — Verify email
      </div>

      <h1 className={s.cardTitle}>Check your inbox</h1>
      <p className={s.cardSub}>
        We sent a 6-digit code to{' '}
        <strong style={{ color: 'var(--c-indigo-600)' }}>{masked}</strong>.
        Enter it below to verify your account.
      </p>

      {/* OTP boxes */}
      <OTPBoxes
        onComplete={handleComplete}
        error={error}
        disabled={loading}
        onPasteReady={fn => { resetRef.current = fn; }}
      />

      {/* Verify button */}
      <Button
        fullWidth size="lg"
        loading={loading}
        disabled={code.length < 6 || loading}
        onClick={handleVerify}
        style={{ marginBottom: 16 }}
      >
        {loading ? 'Verifying…' : 'Verify & create account'}
      </Button>

      <div className={s.divider}>
        <div className={s.dividerLine} />
        <span className={s.dividerText}>wrong email?</span>
        <div className={s.dividerLine} />
      </div>

      <Button variant="ghost" fullWidth onClick={() => goScreen('signup')} disabled={loading}>
        ← Use a different email
      </Button>

      <p className={s.terms} style={{ marginTop: 16 }}>
        Didn't receive anything? Check your spam folder or wait a moment then resend.
      </p>
    </AuthLayout>
  );
}
