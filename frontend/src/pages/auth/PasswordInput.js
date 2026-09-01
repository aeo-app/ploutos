import React, { useState } from 'react';
import s from './Auth.module.css';

/**
 * Drop-in replacement for a raw <input type="password">. Accepts the same
 * props (value, onChange, onFocus, onBlur, className, etc.) and forwards
 * them all — only difference is a show/hide eye-icon toggle so the user
 * can verify what they've actually typed, which is especially useful
 * alongside the live password-requirements checklist on signup.
 */
export function PasswordInput({ className, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={s.passwordWrap}>
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={`${className || ''} ${s.passwordInput}`}
      />
      <button
        type="button"
        className={s.passwordToggle}
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? (
          // Eye-with-slash (hide)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // Plain eye (show)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
