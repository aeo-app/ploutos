import React from 'react';
import { useAuth } from '../../context/AuthContext';

import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Beta from './components/Beta.jsx';
import Product from './components/Product.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Audience from './components/Audience.jsx';
import Agent from './components/Agent.jsx';
import Pricing from './components/Pricing.jsx';
import Faq from './components/Faq.jsx';
import Proof from './components/Proof.jsx';
import Blog from './components/Blog.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';
import { JsonLd } from '../../components/JsonLd';
import { organizationSchema } from './schema';

import './LandingPage.css';

/*
  Marketing entry page for the app — structure and copy match the approved
  design (https://claude.ai/artifact/H7fbdYzGHStbUZGpAC1XGn): sticky nav,
  dark hero, product pillars, a 5-tab "how it works" walkthrough, audience
  comparison, a dark AI-agent band, pricing, FAQ, social proof, blog, a
  final CTA and footer.

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
      <JsonLd data={organizationSchema} />
      <Nav onSignIn={handleSignIn} onGetStarted={handleGetStarted} />
      <Hero onGetStarted={handleGetStarted} />
      {/* <Beta /> */}
      <Product />
      <HowItWorks />
      <Audience />
      <Agent />
      <Pricing onStartTrial={handleStartTrial} initialPlans={initialPlans} />
      <Faq />
      <Proof />
      <Blog initialPosts={initialPosts} />
      <Contact />
      <Footer />
    </div>
  );
}
