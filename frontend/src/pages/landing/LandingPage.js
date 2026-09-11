import React from 'react';
import { useAuth } from '../../context/AuthContext';

import Hero from './components/Hero.jsx';
import Logos from './components/Logos.jsx';
import Stats from './components/Stats.jsx';
import Bento from './components/Bento.jsx';
import Demo from './components/Demo.jsx';
import Solutions from './components/Solutions.jsx';
import ThreeUp from './components/ThreeUp.jsx';
import MarketingAgent from './components/MarketingAgent.jsx';
import Pricing from './components/Pricing.jsx';
import Quotes from './components/Quotes.jsx';
import Blog from './components/Blog.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';

import './LandingPage.css';

/*
  Marketing entry page for the app.

  Not authenticated -> this is the first thing a visitor sees (AuthContext
  defaults `authScreen` to 'landing'). Its Login / Sign up / Get started /
  Start trial CTAs just move the shared AuthContext to the 'login' or
  'signup' screen — the actual authentication (API calls, tokens, OTP
  verification, etc.) is handled entirely by the existing LoginPage /
  SignupPage flow, unchanged. Once AuthContext marks the user as
  authenticated (`authScreen === null`), App.js renders the existing
  apac_premium application instead of this page.
*/
export function LandingPage({ initialPlans, initialPosts } = {}) {
  const { goScreen } = useAuth();

  const handleSignIn = () => goScreen('login');
  const handleGetStarted = () => goScreen('signup');
  const handleStartTrial = () => goScreen('signup');

  return (
    <div className="page landingPage">
      <Hero onSignIn={handleSignIn} onGetStarted={handleGetStarted} />
      <Logos />
      <Stats />
      <Bento />
      <Demo />
      <Solutions />
      <ThreeUp />
      <MarketingAgent />
      <Pricing onStartTrial={handleStartTrial} initialPlans={initialPlans} />
      <Quotes />
      <Blog initialPosts={initialPosts} />
      <Contact />
      <Footer />
    </div>
  );
}
