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
export function LandingPage({ initialPlans, initialPosts } = {}) {
  const { goScreen } = useAuth();

  const handleSignIn = () => goScreen('login');
  const handleGetStarted = () => goScreen('signup');
  const handleStartTrial = () => goScreen('signup');

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
