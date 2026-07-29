import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOTPInput } from '../../hooks/useOTPInput';
import s from './Auth.module.css';

const CIRCUMFERENCE = 2 * Math.PI * 7; // r=7 → ~44

export function OTPBoxes({ onComplete, error, disabled, onPasteReady }) {
  const otp = useOTPInput({ onComplete });

  // Focus first box on mount
  useEffect(() => { setTimeout(() => otp.focus(0), 120); }, []);

  return (
    <div>
      {/* 6 boxes */}
      <div className={s.otpRow} onPaste={otp.handlePaste} role="group" aria-label="6-digit verification code">
        {otp.digits.map((d, i) => (
          <motion.input
            key={i}
            ref={el => (otp.refs.current[i] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={d}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            onChange={e => otp.handleChange(i, e.target.value)}
            onKeyDown={e => otp.handleKeyDown(i, e)}
            className={[
              s.otpBox,
              d ? s.otpBoxFilled : '',
              error ? s.otpBoxError : '',
            ].join(' ')}
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.04, duration: 0.22, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          className={s.otpError}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      {/* Resend row with SVG countdown ring */}
      <div className={s.resendRow}>
        {otp.canResend ? (
          <button
            type="button"
            className={s.resendBtn}
            onClick={otp.startCountdown}
            disabled={disabled}
          >
            Resend code →
          </button>
        ) : (
          <div className={s.resendTimer}>
            <svg className={s.timerTrack} viewBox="0 0 20 20">
              <circle className={s.timerBg} cx="10" cy="10" r="7" />
              <circle
                className={s.timerFill}
                cx="10" cy="10" r="7"
                strokeDashoffset={CIRCUMFERENCE * (1 - otp.countdown / 60)}
              />
            </svg>
            Resend in {otp.countdown}s
          </div>
        )}
      </div>

      {/* Return the reset fn so parent can clear on error */}
      {onPasteReady && onPasteReady(otp.reset)}
    </div>
  );
}
