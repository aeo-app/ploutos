import React, { useState, useEffect } from 'react';
import './styles/globals.css';

import { AppProvider, useApp }   from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PaymentProvider } from './context/PaymentContext';
import { AppShell }              from './components/layout/AppShell';
import { Toasts }                from './components/ui/Toast';
import { authApi } from './api/authApi';
import { CompleteProfilePage } from './pages/auth/CompleteProfilePage';

// App pages
import { HomePage }            from './pages/HomePage';
import { CompetitorsPage }     from './pages/CompetitorsPage';
import { KeywordsPage }        from './pages/KeywordsPage';
import { ProfilePage }         from './pages/ProfilePage';
import { DomainAuthorityPage } from './pages/DomainAuthorityPage';
import { FullReportPage }      from './pages/FullReportPage';
import { ContentStrategyPage } from './pages/ContentStrategyPage';
import { RelocationCalendarPage } from './pages/RelocationCalendarPage';
import { BlogsPage } from './pages/BlogsPage';
import { HistoryPage } from './pages/HistoryPage';
import { BillingPage } from './pages/BillingPage';
import { BlogTopicsPage } from './pages/BlogTopicsPage';
import { ArticleGeneratorPage } from './pages/ArticleGeneratorPage';
import { AdminApp } from './pages/AdminApp';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import { ConnectPageApprovalPage } from './pages/ConnectPageApprovalPage';
import { PublicBlogPostPage } from './pages/PublicBlogPostPage';
import { PublicBlogIndexPage } from './pages/PublicBlogIndexPage';

// Auth pages
import { SignupPage }       from './pages/auth/SignupPage';
import { SignupVerifyPage } from './pages/auth/SignupVerifyPage';
import { LoginPage }        from './pages/auth/LoginPage';
import { LoginVerifyPage }  from './pages/auth/LoginVerifyPage';

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
  blogs: BlogsPage,
  history: HistoryPage,
  billing: BillingPage,
  blogTopics: BlogTopicsPage,
  articleGenerator: ArticleGeneratorPage,
};

const AUTH_SCREENS = {
  'landing':       LandingPage,
  'login':         LoginPage,
  'login-verify':  LoginVerifyPage,
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

function ProfileGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [hasProfile, setHasProfile] = useState(true); // optimistic default — don't flash the gate for the common case
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authApi.getProfile()
      .then(data => {
        if (cancelled) return;
        setProfile(data);
        setHasProfile(!!data.has_profile);
      })
      .catch(err => {
        // GET /auth/profile calls Cognito's own get_user API directly on the
        // backend (not the local JWT-decode path other endpoints use), so it
        // does NOT respect SKIP_JWT_VERIFICATION — if Cognito isn't fully
        // configured/reachable in this environment, this is the single most
        // likely place prepopulation quietly breaks. Logged, not swallowed,
        // so it's visible in devtools instead of just "nothing happens".
        console.warn('[ProfileGate] GET /auth/profile failed — profile-based prepopulation will fall back to history only:', err?.message || err);
        if (!cancelled) setHasProfile(true);
      }) // fail open — a transient error shouldn't lock anyone out
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-slate-50)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--c-slate-200)', borderTopColor: 'var(--c-indigo-600)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  // Existing accounts that signed up before company_name/domain were
  // required must complete this once — blocks everything else, same
  // principle as the payment gate but for profile data instead of payment.
  if (!hasProfile) {
    return <CompleteProfilePage onComplete={(p) => { setProfile(p); setHasProfile(true); }} />;
  }

  return children(profile);
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

  // Authenticated → profile completion (domain/company_name) is checked
  // once, then straight into the app. Payment is no longer a blanket gate
  // here — it's triggered contextually instead: either by a 402 from a
  // still-gated endpoint (competitors/keywords/profile/domain-authority/
  // full-report), or by clicking a locked teaser card on the content-strategy
  // /relocation-calendar pages. PaymentProvider still wraps everything so
  // usePayment() works wherever it's needed (Billing page, unlock modals).
  return (
    <ProfileGate>
      {(profile) => (
        <PaymentProvider>
          <AppProvider>
            <AdminAwareRoot profile={profile} />
            <Toasts />
          </AppProvider>
        </PaymentProvider>
      )}
    </ProfileGate>
  );
}

/**
 * Admins land in the completely separate AdminApp (own shell, own nav — see
 * pages/AdminApp.js) by default; "Exit to my account" switches to the
 * regular AppShell for their own company's tools, with a link back in
 * TopBar. Non-admins only ever see the regular AppShell — there's no
 * admin-mode toggle available to them at all.
 */
function AdminAwareRoot({ profile }) {
  const [viewMode, setViewMode] = useState(profile?.is_admin ? 'admin' : 'user');

  // Both shells stay mounted the whole time (for admins) — only visibility
  // toggles. Previously this conditionally RETURNED one or the other,
  // which meant switching to Admin and back fully unmounted AppShell/
  // AppRouter/whichever page was open, wiping all of that page's local
  // state (e.g. RelocationCalendarPage's in-progress/just-generated
  // calendar) even though the shared AppContext data survived. Toggling
  // display instead of mounting means a page you were looking at is
  // exactly as you left it when you come back, no re-fetch race involved.
  if (!profile?.is_admin) {
    return (
      <AppShell profile={profile}>
        <AppRouter />
      </AppShell>
    );
  }

  return (
    <>
      <div style={{ display: viewMode === 'admin' ? 'block' : 'none' }}>
        <AdminErrorBoundary onExitToUserView={() => setViewMode('user')}>
          <AdminApp onExitToUserView={() => setViewMode('user')} />
        </AdminErrorBoundary>
      </div>
      <div style={{ display: viewMode === 'user' ? 'block' : 'none' }}>
        <AppShell profile={profile} onEnterAdminView={() => setViewMode('admin')}>
          <AppRouter />
        </AppShell>
      </div>
    </>
  );
}

export default function App() {
  // Checked BEFORE AuthProvider/Root — a page admin approving a connection
  // invite may have no account on this platform at all, so this route
  // can't sit behind any of the normal auth gating. Matched here, not via
  // a routing library, since the rest of this app is state-based routing
  // within an authenticated shell — this is the one URL-path route that
  // genuinely needs to exist outside that entirely.
  const pathMatch = window.location.pathname.match(/^\/connect-page\/([^/]+)\/?$/);
  if (pathMatch) {
    return <ConnectPageApprovalPage inviteToken={pathMatch[1]} />;
  }

  if (window.location.pathname === '/blog' || window.location.pathname === '/blog/') {
    return <PublicBlogIndexPage />;
  }

  const blogMatch = window.location.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (blogMatch) {
    return <PublicBlogPostPage slug={blogMatch[1]} />;
  }

  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
