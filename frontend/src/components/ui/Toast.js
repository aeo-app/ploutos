import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import s from './Toast.module.css';

const META = {
  success: { icon: '✅', cls: s.toastSuccess },
  error:   { icon: '❌', cls: s.toastError },
  warning: { icon: '⚠️', cls: s.toastWarning },
  info:    { icon: 'ℹ️', cls: s.toastInfo },
};

function Toast({ toast }) {
  const { dismissToast } = useApp();
  const m = META[toast.type] || META.info;
  return (
    <motion.div
      className={`${s.toast} ${m.cls}`}
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={() => dismissToast(toast.id)}
    >
      <span className={s.icon}>{m.icon}</span>
      <span className={s.message}>{toast.message}</span>
    </motion.div>
  );
}

export function Toasts() {
  const { state } = useApp();
  return (
    <div className={s.container} aria-live="assertive">
      <AnimatePresence>
        {state.toasts.map(t => <Toast key={t.id} toast={t} />)}
      </AnimatePresence>
    </div>
  );
}
