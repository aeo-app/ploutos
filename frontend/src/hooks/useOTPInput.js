import { useState, useRef, useCallback, useEffect } from 'react';

const LEN = 6;

export function useOTPInput({ onComplete } = {}) {
  const [digits, setDigits]       = useState(Array(LEN).fill(''));
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const refs    = useRef([]);
  const timerRef = useRef(null);

  // Start countdown on mount
  useEffect(() => {
    startCountdown();
    return () => clearInterval(timerRef.current);
  }, []);

  // Notify when complete
  useEffect(() => {
    const val = digits.join('');
    if (val.length === LEN && !digits.includes('')) {
      onComplete?.(val);
    }
  }, [digits]);

  const focus = useCallback(i => {
    const el = refs.current[i];
    if (el) { el.focus(); el.select(); }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(60); setCanResend(false);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) { clearInterval(timerRef.current); setCanResend(true); return 0; }
        return p - 1;
      });
    }, 1000);
  }, []);

  const handleChange = useCallback((i, raw) => {
    const ch = raw.replace(/\D/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[i] = ch;
      return next;
    });
    if (ch && i < LEN - 1) setTimeout(() => focus(i + 1), 0);
  }, [focus]);

  const handleKeyDown = useCallback((i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        setDigits(p => { const n = [...p]; n[i] = ''; return n; });
      } else if (i > 0) {
        setDigits(p => { const n = [...p]; n[i - 1] = ''; return n; });
        focus(i - 1);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft'  && i > 0)       { focus(i - 1); e.preventDefault(); }
    else if   (e.key === 'ArrowRight' && i < LEN - 1) { focus(i + 1); e.preventDefault(); }
  }, [digits, focus]);

  const handlePaste = useCallback(e => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    if (!pasted) return;
    const next = Array(LEN).fill('');
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setDigits(next);
    focus(Math.min(pasted.length, LEN - 1));
  }, [focus]);

  const reset = useCallback(() => {
    setDigits(Array(LEN).fill(''));
    setTimeout(() => focus(0), 0);
  }, [focus]);

  return {
    digits, refs, value: digits.join(''),
    isComplete: digits.join('').length === LEN && !digits.includes(''),
    countdown, canResend, startCountdown,
    handleChange, handleKeyDown, handlePaste, reset, focus,
  };
}
