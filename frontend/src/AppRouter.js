import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './context/AppContext';
import { DashboardPage, PromptsPage, CompetitorsAeoPage, EnginesPage } from './aeo/pages/AnalyticsPages';
import { DomainAuthorityAeoPage, CompanyAeoPage } from './aeo/pages/DomainCompanyPages';
import { StrategyAeoPage, BlogsAeoPage, CalendarAeoPage } from './aeo/pages/ContentPages';
import { CompetitorsPage }     from './pages/CompetitorsPage';
import { KeywordsPage }        from './pages/KeywordsPage';
import { ContentStrategyPage } from './pages/ContentStrategyPage';
import { HistoryPage } from './pages/HistoryPage';
import { BillingPage } from './pages/BillingPage';
import { ArticleGeneratorPage } from './pages/ArticleGeneratorPage';

/* ── App page router ─────────────────────────────────────── */
export const APP_PAGES = {
  // AEO dashboard
  home:           DashboardPage,
  aeoPrompts:     PromptsPage,
  aeoCompetitors: CompetitorsAeoPage,
  aeoEngines:     EnginesPage,
  da:             DomainAuthorityAeoPage,
  profile:        CompanyAeoPage,
  aeoStrategy:    StrategyAeoPage,
  aeoBlogs:       BlogsAeoPage,
  aeoCalendar:    CalendarAeoPage,
  // Original tools, still reachable from "More tools"
  compete:  CompetitorsPage,
  keywords: KeywordsPage,
  contentStrategy: ContentStrategyPage,
  publishCalendar: CalendarAeoPage,
  relocationCalendar: CalendarAeoPage,
  blogs: BlogsAeoPage,
  history: HistoryPage,
  billing: BillingPage,
  blogTopics: BlogsAeoPage,
  articleGenerator: ArticleGeneratorPage,
};


const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.18 } },
};

export function AppRouter({ overrides }) {
  const { state } = useApp();
  const Page = (overrides && overrides[state.page]) || APP_PAGES[state.page] || DashboardPage;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={state.page} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Page />
      </motion.div>
    </AnimatePresence>
  );
}

