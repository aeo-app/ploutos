import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/Button';
import s from './AnalyseForm.module.css';

const QUICK = [
  { company_name: 'APAC Relocation', url: 'https://www.apacrelocation.com', market: 'Singapore', industry: 'International Relocation / Moving Services' },
  { company_name: 'Crown Relocations', url: 'https://www.crownrelo.com', market: 'Singapore', industry: 'International Relocation / Moving Services' },
  { company_name: 'PropertyGuru', url: 'https://www.propertyguru.com.sg', market: 'Singapore', industry: 'Real Estate Portal' },
];

function Field({ label, name, value, onChange, placeholder, required, type = 'text' }) {
  return (
    <div className={s.field}>
      <label className={s.label}>
        {label}{required && <span className={s.required}>*</span>}
      </label>
      <input
        type={type}
        className={s.input}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(name, e.target.value)}
      />
    </div>
  );
}

export function AnalyseForm({ onSubmit, loading, buttonLabel = 'Analyse', compact = false, showQuickStarts = false }) {
  const { state, setRequest } = useApp();
  const { request } = state;
  const set = (k, v) => setRequest({ [k]: v });
  const submit = e => { e.preventDefault(); if (!request.company_name) return; onSubmit(request); };

  if (compact) {
    return (
      <motion.form
        onSubmit={submit}
        className={`${s.form} ${s.compact}`}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Field label="Company" name="company_name" value={request.company_name} onChange={set} placeholder="ABC Company" required />
        <Field label="URL" name="url" value={request.url} onChange={set} placeholder="https://abccompany.com" required />
        {/* <Field label="Market" name="market" value={request.market} onChange={set} placeholder="Singapore" /> */}
        <Button type="submit" size="md" loading={loading} disabled={!request.company_name}>
          {loading ? 'Analysing…' : buttonLabel}
        </Button>
      </motion.form>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {showQuickStarts && (
        <div>
          <div className={s.label} style={{ marginBottom: 8 }}>Quick start</div>
          <div className={s.quickStarts}>
            {QUICK.map((q, i) => (
              <button key={i} type="button" className={s.qsPill} onClick={() => setRequest(q)}>
                {q.company_name}
              </button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className={s.form}>
        <div className={s.formTitle}>Run SEO Analysis</div>
        <div className={s.formSub}>Enter any company to generate AI-powered competitive intelligence in seconds.</div>
        <div className={s.grid}>
          <Field label="Company Name" name="company_name" value={request.company_name} onChange={set} placeholder="e.g. ABC Company" required />
          <Field label="Website URL" name="url" value={request.url} onChange={set} placeholder="https://abccompany.com" />
          {/* <Field label="Market / City" name="market" value={request.market} onChange={set} placeholder="Singapore" />
          <Field label="Industry" name="industry" value={request.industry} onChange={set} placeholder="International Relocation / Moving Services" /> */}
        </div>
        <div className={s.footer}>
          <Button type="submit" size="lg" loading={loading} disabled={!request.company_name}>
            {loading ? 'Analysing…' : buttonLabel}
          </Button>
          {loading && <span className={s.hint}>⏱ Claude AI is processing — this takes 15–40s…</span>}
        </div>
      </form>
    </motion.div>
  );
}
