import React from 'react';
import { motion } from 'framer-motion';
import s from './Button.module.css';

export function Button({
  children, variant = 'primary', size = 'md',
  loading, disabled, onClick, type = 'button',
  fullWidth, className, style,
}) {
  const cls = [
    s.btn,
    s[variant],
    s[size],
    fullWidth ? s.full : '',
    className || '',
  ].join(' ');

  const spinnerCls = variant === 'primary' ? s.spinner : `${s.spinner} ${s.spinnerDark}`;

  return (
    <motion.button
      type={type}
      className={cls}
      disabled={disabled || loading}
      onClick={onClick}
      aria-busy={loading}
      style={style}
      whileTap={!disabled && !loading ? { scale: 0.97 } : {}}
    >
      {loading && <span className={spinnerCls} aria-hidden />}
      {children}
    </motion.button>
  );
}
