import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { AuthLayout } from './AuthLayout';
import { OTPBoxes } from './OTPBoxes';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/authApi';
import { PasswordRequirementsChecklist, isPasswordValid, firstUnmetPasswordRequirement } from './PasswordRequirements';
import { PasswordInput } from './PasswordInput';
import s from './Auth.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Two-step "forgot password" flow, mirroring SignupVerifyPage/
 * LoginVerifyPage's shape: step 1 collects the email and calls
 * POST /auth/forgot-password to send a 6-digit reset code; step 2 collects
 * that code plus a new password and calls POST /auth/reset-password
 * (routers/auth_router.py — see ConfirmForgotPasswordRequest). Reuses the
 * same OTPBoxes / PasswordInput / PasswordRequirementsChecklist components
 * signup and verification already use, so the reset code entry and new
 * password entry look and behave identically to the rest of the auth flow.
 */
export function ForgotPasswordPage() {
  const { auth, goScreen, setPending } = useAuth();

  const [step, setStep] = useState('email'); // 'email' | 'reset' | 'done'
  const [email, setEmail] = useState(auth.pendingEmail || '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const resetOtpRef = useRef(null);

  const masked = email.replace(/(.{2}).+(@.+)/, '$1***$2');

  const emailErr = emailTouched && (!email.trim() || !EMAIL_RE.test(email))
    ? (!email.trim() ? 'Email is required' : 'Enter a valid email address')
    : '';

  const passwordErr = passwordTouched && (!newPassword.trim() || !isPasswordValid(newPassword))
    ? (!newPassword.trim() ? 'New password is required' : `Password needs: ${firstUnmetPasswordRequirement(newPassword)}`)
    : '';

  const confirmErr = confirmTouched && (!confirmPassword.trim() || confirmPassword !== newPassword)
    ? (!confirmPassword.trim() ? 'Confirm your new password' : 'Passwords do not match')
    : '';

  const handleSendCode = async (e) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!email.trim() || !EMAIL_RE.test(email)) return;
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: email.trim() });
      setPending(email.trim(), '', '');
      setStep('reset');
    } catch (err) {
      if (err.code === 'UserNotFoundException') {
        setError('No account found with this email.');
      } else if (err.code === 'LimitExceededException' || err.code === 'TooManyRequestsException') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (err.code === 'NetworkError') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Could not send a reset code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await authApi.forgotPassword({ email: email.trim() });
      setError('');
    } catch (err) {
      setError(err.message || 'Could not resend the code. Please try again.');
    }
  };

  const handleReset = async () => {
    setPasswordTouched(true);
    setConfirmTouched(true);
    if (code.length < 6) { setError('Enter all 6 digits'); return; }
    if (!isPasswordValid(newPassword)) { setError(`Password needs: ${firstUnmetPasswordRequirement(newPassword)}`); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword({ email: email.trim(), code, new_password: newPassword });
      setStep('done');
    } catch (err) {
      if (err.code === 'CodeMismatchException') {
        setError('Incorrect reset code. Please check your email and try again.');
      } else if (err.code === 'ExpiredCodeException') {
        setError('This code has expired. Request a new one below.');
      } else if (err.code === 'InvalidPasswordException') {
        setError(err.message || "Password doesn't meet the requirements below.");
      } else if (err.code === 'LimitExceededException' || err.code === 'TooManyRequestsException') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (err.code === 'NetworkError') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Could not reset your password. Please try again.');
      }
      resetOtpRef.current?.();
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthLayout>
        <motion.div className={s.successWrap} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.div className={s.successRing} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: 2, duration: 0.5 }}>
            ✓
          </motion.div>
          <div className={s.successTitle}>Password reset</div>
          <div className={s.successSub}>You can now sign in with your new password.</div>
        </motion.div>
        <Button fullWidth size="lg" onClick={() => goScreen('login')} style={{ marginTop: 20 }}>
          Back to sign in →
        </Button>
      </AuthLayout>
    );
  }

  if (step === 'reset') {
    return (
      <AuthLayout>
        <div className={s.cardBadge}>
          <span className={s.cardBadgeDot} />
          Step 2 of 2 — Reset password
        </div>

        <h1 className={s.cardTitle}>Check your inbox</h1>
        <p className={s.cardSub}>
          We sent a 6-digit reset code to{' '}
          <strong style={{ color: 'var(--c-indigo-600)' }}>{masked}</strong>. Enter it below along with your new password.
        </p>

        <div className={s.steps}>
          {[
            { label: 'Enter email', state: 'stepDone' },
            { label: 'Reset password', state: 'stepActive' },
          ].map((step2, i) => (
            <div key={i} className={`${s.step} ${s[step2.state]}`}>
              <div className={s.stepDot}>{step2.state === 'stepDone' ? '✓' : i + 1}</div>
              <span className={s.stepLabel}>{step2.label}</span>
            </div>
          ))}
        </div>

        <OTPBoxes
          onComplete={setCode}
          error={error && code.length < 6 ? error : ''}
          disabled={loading}
          onPasteReady={fn => { resetOtpRef.current = fn; }}
        />

        <div className={s.fields} style={{ marginTop: 4 }}>
          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              New Password<span className={s.fieldRequired}>*</span>
            </label>
            <PasswordInput
              autoComplete="new-password"
              value={newPassword}
              placeholder="Enter new password (min. 8 characters)"
              className={`${s.input} ${passwordErr ? s.inputError : ''}`}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={() => setPasswordTouched(true)}
              onBlur={() => setPasswordTouched(true)}
              disabled={loading}
              aria-invalid={!!passwordErr}
            />
            {passwordTouched && <PasswordRequirementsChecklist password={newPassword} />}
          </div>

          <div className={s.fieldWrap}>
            <label className={s.fieldLabel}>
              Confirm New Password<span className={s.fieldRequired}>*</span>
            </label>
            <PasswordInput
              autoComplete="new-password"
              value={confirmPassword}
              placeholder="Confirm your new password"
              className={`${s.input} ${confirmErr ? s.inputError : ''}`}
              onChange={e => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              disabled={loading}
              aria-invalid={!!confirmErr}
            />
            {confirmErr && <div className={s.fieldErr}>⚠ {confirmErr}</div>}
          </div>
        </div>

        {error && code.length >= 6 && (
          <motion.div className={s.fieldErr} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16 }}>
            ⚠ {error}
          </motion.div>
        )}

        <Button
          fullWidth size="lg"
          loading={loading}
          disabled={loading}
          onClick={handleReset}
          style={{ marginBottom: 16 }}
        >
          {loading ? 'Resetting…' : 'Reset password →'}
        </Button>

        <div className={s.divider}>
          <div className={s.dividerLine} />
          <span className={s.dividerText}>trouble with the code?</span>
          <div className={s.dividerLine} />
        </div>

        <Button variant="ghost" fullWidth onClick={handleResendCode} disabled={loading} style={{ marginBottom: 10 }}>
          Resend code
        </Button>
        <Button variant="ghost" fullWidth onClick={() => { setStep('email'); setError(''); setCode(''); }} disabled={loading}>
          ← Use a different email
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className={s.cardBadge}>
        <span className={s.cardBadgeDot} />
        Step 1 of 2 — Reset password
      </div>

      <h1 className={s.cardTitle}>Forgot your password?</h1>
      <p className={s.cardSub}>
        Enter the email on your account and we'll send you a 6-digit code to reset your password.
      </p>

      <form onSubmit={handleSendCode} noValidate>
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
              onBlur={() => setEmailTouched(true)}
              disabled={loading}
              aria-invalid={!!(emailErr || error)}
            />
            {emailErr && <div className={s.fieldErr}>⚠ {emailErr}</div>}
          </div>
        </div>

        {error && (
          <motion.div className={s.fieldErr} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 16 }}>
            ⚠ {error}
          </motion.div>
        )}

        <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading}>
          {loading ? 'Sending code…' : 'Send reset code →'}
        </Button>
      </form>

      <p className={s.switchRow}>
        Remembered your password?{' '}
        <button className={s.switchLink} onClick={() => goScreen('login')} type="button">
          Back to sign in
        </button>
      </p>
    </AuthLayout>
  );
}
