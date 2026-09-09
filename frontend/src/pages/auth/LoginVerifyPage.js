import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { OTPBoxes }   from './OTPBoxes';
import { Button }     from '../../components/ui/Button';
import { useAuth }    from '../../context/AuthContext';
import { authApi }    from '../../api/authApi';
import s from './Auth.module.css';

export function LoginVerifyPage() {
  const { auth, goScreen, login } = useAuth();
  const email  = auth.pendingEmail;
  const password = auth.pendingPassword;
  const masked = email.replace(/(.{2}).+(@.+)/, '$1***$2');

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
      // Confirming an account is the same Cognito operation regardless of
      // whether the user reached it via signup or (as here) tried to log
      // in before ever verifying — reuses the same real endpoint
      // SignupVerifyPage.js uses. The previous code called
      // authApi.verifyOTP, which didn't exist as an actual function at
      // all (it was commented out in authApi.js) — this whole screen was
      // unreachable-but-broken until now, since LoginPage.js never
      // actually routed here either.
      await authApi.verifyEmail({ email, code });
      const data = await authApi.login({ email, password });
      setSuccess(true);
      setTimeout(() => login({ email, ...data?.user }), 1200);
    } catch (e) {
      if (e.code === 'CodeMismatchException') {
        setError('Incorrect verification code. Please check your email and try again.');
      } else if (e.code === 'ExpiredCodeException') {
        setError('This code has expired. Request a new one below.');
      } else {
        setError(e.message || 'Invalid code. Please try again.');
      }
      resetRef.current?.();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendCode({ email });
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <motion.div className={s.successWrap} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.div className={s.successRing} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: 2, duration: 0.5 }}>
            ✓
          </motion.div>
          <div className={s.successTitle}>Signed in!</div>
          <div className={s.successSub}>Taking you to your dashboard…</div>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Badge */}
      <div className={s.cardBadge}>
        <span className={s.cardBadgeDot} />
        Step 2 of 2 — Enter code
      </div>

      <h1 className={s.cardTitle}>Check your inbox</h1>
      <p className={s.cardSub}>
        We sent a 6-digit sign-in code to{' '}
        <strong style={{ color: 'var(--c-indigo-600)' }}>{masked}</strong>.
      </p>

      {/* Step indicator */}
      <div className={s.steps}>
        {[
          { label: 'Enter email', state: 'stepDone' },
          { label: 'Enter code',  state: 'stepActive' },
        ].map((step, i) => (
          <div key={i} className={`${s.step} ${s[step.state]}`}>
            <div className={s.stepDot}>{step.state === 'stepDone' ? '✓' : i + 1}</div>
            <span className={s.stepLabel}>{step.label}</span>
          </div>
        ))}
      </div>

      {/* OTP */}
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
        {loading ? 'Signing in…' : 'Sign in →'}
      </Button>

      <div className={s.divider}>
        <div className={s.dividerLine} />
        <span className={s.dividerText}>wrong email?</span>
        <div className={s.dividerLine} />
      </div>

      <Button variant="ghost" fullWidth onClick={() => goScreen('login')} disabled={loading}>
        ← Use a different email
      </Button>

      <p className={s.terms} style={{ marginTop: 16 }}>
        Didn't receive a code? Check spam or wait for the resend timer above.
      </p>
    </AuthLayout>
  );
}
