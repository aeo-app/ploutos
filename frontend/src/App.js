import React from 'react';
import './styles/globals.css';

import { AppProvider, useApp }   from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PaymentProvider, usePayment } from './context/PaymentContext';
import { AppShell }              from './components/layout/AppShell';
import { Toasts }                from './components/ui/Toast';
import { CheckoutPage }          from './pages/CheckoutPage';

// App pages
import { HomePage }            from './pages/HomePage';
import { CompetitorsPage }     from './pages/CompetitorsPage';
import { KeywordsPage }        from './pages/KeywordsPage';
import { ProfilePage }         from './pages/ProfilePage';
import { DomainAuthorityPage } from './pages/DomainAuthorityPage';
import { FullReportPage }      from './pages/FullReportPage';
import { ContentStrategyPage } from './pages/ContentStrategyPage';
import { RelocationCalendarPage } from './pages/RelocationCalendarPage';
import { HistoryPage } from './pages/HistoryPage';
import { BillingPage } from './pages/BillingPage';

// Auth pages
import { SignupPage }       from './pages/auth/SignupPage';
import { SignupVerifyPage } from './pages/auth/SignupVerifyPage';
import { LoginPage }        from './pages/auth/LoginPage';

// Landing page (entry point)
import { LandingPage }      from './pages/landing/LandingPage';

import { AnimatePresence, motion } from 'framer-motion';

/* ── App page router ─────────────────────────────────────── */
const APP_PAGES = {
  home:     HomePage,
  compete:  CompetitorsPage,
  keywords: KeywordsPage,
  profile:  ProfilePage,
  da:       DomainAuthorityPage,
  report:   FullReportPage,
  contentStrategy: ContentStrategyPage,
  relocationCalendar: RelocationCalendarPage,
  history: HistoryPage,
  billing: BillingPage,
};

const AUTH_SCREENS = {
  'landing':       LandingPage,
  'login':         LoginPage,
  'signup':        SignupPage,
  'signup-verify': SignupVerifyPage,
};

const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.18 } },
};

function AppRouter() {
  const { state } = useApp();
  const Page = APP_PAGES[state.page] || HomePage;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={state.page} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Page />
      </motion.div>
    </AnimatePresence>
  );
}

function Root() {
  const { auth } = useAuth();

  // Not authenticated → show auth screens
  if (auth.authScreen !== null) {
    const AuthScreen = AUTH_SCREENS[auth.authScreen] || LoginPage;
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={auth.authScreen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <AuthScreen />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Authenticated → check payment status before showing the app at all
  return (
    <PaymentProvider>
      <PaymentGate />
    </PaymentProvider>
  );
}

function PaymentGate() {
  const { isPaid, checking } = usePayment();

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--c-slate-50)',
      }}>
        <div style={{
          width: 28, height: 28, border: '3px solid var(--c-slate-200)',
          borderTopColor: 'var(--c-indigo-600)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  // Not paid → the entire application is inaccessible until checkout completes
  if (!isPaid) {
    return <CheckoutPage />;
  }

  return (
    <AppProvider>
      <AppShell>
        <AppRouter />
      </AppShell>
      <Toasts />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
