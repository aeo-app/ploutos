import React from 'react';
import { useAuth } from '../../context/AuthContext';

import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Platforms from './components/Platforms.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Studio from './components/Studio.jsx';
import Autopilot from './components/Autopilot.jsx';
import Demo from './components/Demo.jsx';
import Features from './components/Features.jsx';
import Pricing from './components/Pricing.jsx';
import Faq from './components/Faq.jsx';
import Blog from './components/Blog.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';
import { JsonLd } from '../../components/JsonLd';
import { organizationSchema } from './schema';

import './LandingPage.css';

/*
  Marketing entry page for the app. Section order follows the approved design
  (aeo-app-landingpage.html): sticky nav, hero with an audit form and a
  dashboard preview, platforms strip, "how it works", the AI content studio,
  auto-publishing, an interactive industry demo, features, pricing, FAQ,
  blog, a final call to action and the footer.

  The Pricing section is the original one, unchanged: it still loads the live
  plans from /payment/plans (with the same offline fallback) and shows the
  same plan names, prices, descriptions and features.

  Not authenticated -> this is the first thing a visitor sees (AuthContext
  defaults `authScreen` to 'landing'). Its Log in / Get free audit / Start
  trial CTAs just move the shared AuthContext to the 'login' or 'signup'
  screen — the actual authentication (API calls, tokens, OTP verification,
  etc.) is handled entirely by the existing LoginPage / SignupPage flow,
  unchanged. What a visitor types into the landing forms (website, name,
  email, country) is handed to SignupPage through sessionStorage. Once
  AuthContext marks the user as authenticated (`authScreen === null`),
  App.js renders the existing application instead of this page.
*/
// The top-bar tabs, each served at its own address. `route` is passed by the build-time pre-render; in the browser it is the address.
export const SECTION_PAGES = {
  '/how-it-works': { title: 'How it works — AEO-APP.ai', description: 'See how AEO-APP.ai audits your AI search visibility, builds your content, and publishes it for you.' },
  '/features': { title: 'Features — AEO-APP.ai', description: 'Everything in AEO-APP.ai: AI visibility tracking, competitor analysis, keyword intelligence, content, and publishing.' },
  '/pricing': { title: 'Pricing — AEO-APP.ai', description: 'Simple plans for tracking and improving your AI search visibility, from a free audit to a full content engine.' },
  '/faq': { title: 'FAQ — AEO-APP.ai', description: 'Answers to common questions about AEO-APP.ai, AI search visibility, and how the platform works.' },
};

export function sectionRoute(route) {
  const raw = route || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const p = String(raw).replace(/\/+$/, '') || '/';
  return SECTION_PAGES[p] ? p : null;
}

export function LandingPage({ initialPlans, initialPosts, route } = {}) {
  const { goScreen } = useAuth();
  const section = sectionRoute(route);

  // Moving on to log in / sign up from a tab page: put the address back to "/" so the app does not sit under /pricing.
  const leave = (screen) => () => {
    if (section && typeof window !== 'undefined') window.history.replaceState(null, '', '/');
    goScreen(screen);
  };
  const handleSignIn = leave('login');
  const handleGetStarted = leave('signup');
  const handleStartTrial = leave('signup');

  React.useEffect(() => {
    if (section && typeof document !== 'undefined') document.title = SECTION_PAGES[section].title;
  }, [section]);

  if (section) {
    return (
      <div className="page landingPage">
        <JsonLd data={organizationSchema} />
        <Nav onSignIn={handleSignIn} onGetStarted={handleGetStarted} active={section} />
        {section === '/how-it-works' && (<><HowItWorks /><Studio /><Autopilot /></>)}
        {section === '/features' && (<><Features /><Demo onGetStarted={handleGetStarted} /></>)}
        {section === '/pricing' && <Pricing onStartTrial={handleStartTrial} initialPlans={initialPlans} />}
        {section === '/faq' && <Faq />}
        <Contact onStart={handleGetStarted} />
        <Footer />
      </div>
    );
  }

  return (
    <div className="page landingPage">
      <JsonLd data={organizationSchema} />
      <Nav onSignIn={handleSignIn} onGetStarted={handleGetStarted} />
      <Hero onGetStarted={handleGetStarted} />
      <Platforms />
      <HowItWorks />
      <Studio />
      <Autopilot />
      <Demo onGetStarted={handleGetStarted} />
      <Features />
      <Pricing onStartTrial={handleStartTrial} initialPlans={initialPlans} />
      <Faq />
      <Blog initialPosts={initialPosts} />
      <Contact onStart={handleGetStarted} />
      <Footer />
    </div>
  );
}
