import React from 'react';
import s from './Auth.module.css';

/**
 * Matches the backend's actual Cognito password policy exactly (see
 * infra/cognito.tf's password_policy block) — minimum 8 characters, plus
 * uppercase, lowercase, a number, and a symbol. Previously the frontend
 * only checked length, so a password could pass frontend validation and
 * still fail at Cognito with a confusing, unhandled error.
 */
export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'One lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $ %)', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(password) {
  return PASSWORD_REQUIREMENTS.every(r => r.test(password));
}

export function firstUnmetPasswordRequirement(password) {
  const unmet = PASSWORD_REQUIREMENTS.find(r => !r.test(password));
  return unmet ? unmet.label : null;
}

/** Shown once the password field has been focused/touched, updating live
 * on every keystroke — not just revealed after a failed submit. */
export function PasswordRequirementsChecklist({ password }) {
  return (
    <ul className={s.pwRequirements}>
      {PASSWORD_REQUIREMENTS.map(r => {
        const met = r.test(password);
        return (
          <li key={r.key} className={met ? s.pwReqMet : s.pwReqUnmet}>
            <span className={s.pwReqIcon}>{met ? '✓' : '○'}</span> {r.label}
          </li>
        );
      })}
    </ul>
  );
}
