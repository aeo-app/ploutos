import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { useAuth } from "@/hooks/use-auth"
import {
  ArrowRight,
  BarChart3,
  Globe,
  Search,
  Shield,
  Check,
  Target,
  Users,
  LineChart,
  Zap,
  Layers,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: "easeOut" },
}

const stagger = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.12 },
}

const features = [
  {
    icon: Globe,
    title: "Full Website Analysis",
    description:
      "Our AI crawls your entire site — not just the homepage — extracting products, audience segments, business categories, and industry positioning. Get a structured company profile in seconds.",
  },
  {
    icon: Search,
    title: "Multi-Source Competitor Discovery",
    description:
      "Tavily and DuckDuckGo are searched in parallel with AI-generated queries tailored to your business. Results are deduplicated and filtered by LLM to surface real competitors — not blogs or directories.",
  },
  {
    icon: Shield,
    title: "AI Engine Visibility Tracking",
    description:
      "Know where you stand across ChatGPT, Google AI Overviews, Perplexity, Claude, Gemini, Grok, and Bing. Track citations, share of voice, and prompt appearance trends over time.",
  },
  {
    icon: Target,
    title: "AEO & GEO Optimization Roadmap",
    description:
      "Answer Engine Optimization and Generative Engine Optimization are different from traditional SEO. We identify gaps in how AI engines perceive your brand and deliver targeted fixes.",
  },
  {
    icon: Zap,
    title: "Real-Time Streaming Analysis",
    description:
      "See every step of the analysis as it happens — crawling, query generation, search aggregation, and profile building — streamed live via SSE. No more staring at loading spinners.",
  },
  {
    icon: Layers,
    title: "Structured Competitor Intelligence",
    description:
      "Every competitor comes with a cleaned company name, domain, description, and source attribution. Group results by product line, audience, or category for clear strategic insights.",
  },
]

const useCases = [
  {
    icon: Users,
    title: "Marketing Teams",
    description: "Benchmark your brand against competitors across every AI engine. Prove ROI with concrete visibility metrics and citation data.",
  },
  {
    icon: Target,
    title: "Founders & Startups",
    description: "Validate positioning before you scale. Understand how AI engines describe your product vs. competitors in real-time.",
  },
  {
    icon: LineChart,
    title: "SEO & Growth Specialists",
    description: "Extend your toolkit beyond traditional SERPs. Optimize for how answers are generated, not just how pages are ranked.",
  },
  {
    icon: Shield,
    title: "Enterprise Brand Teams",
    description: "Monitor hundreds of prompts across your portfolio. Get early warnings when competitor citations overtake yours in any engine.",
  },
]

const faqs = [
  {
    q: "What is AEO and GEO, and how are they different from SEO?",
    a: "AEO (Answer Engine Optimization) focuses on getting your content selected as the direct answer in AI chat responses. GEO (Generative Engine Optimization) optimizes for how large language models generate answers that cite your brand. Unlike traditional SEO that targets ranked links, AEO and GEO optimize for citation frequency, brand recall, and contextual relevance within AI-generated text.",
  },
  {
    q: "How does the website analysis work?",
    a: "We crawl up to 5 pages of your site using an HTTP-based crawler (no headless browser — compatible with all environments). The content is fed to Claude Haiku via AWS Bedrock, which extracts a structured CompanyProfile including products, audience segments, business categories, and search terms. We also run AI-generated research queries against Tavily to enrich the profile with external context.",
  },
  {
    q: "What search sources do you use for competitor discovery?",
    a: "Competitors are sourced from Tavily (requires API key) and DuckDuckGo (no key required). The plugin-based SearchSource architecture makes it easy to add new sources. All results are deduplicated by domain and filtered through an LLM that removes social media, Wikipedia, blogs, job boards, and other non-company pages.",
  },
  {
    q: "How long does a typical analysis take?",
    a: "Most websites are analyzed in under 10 seconds. Crawling takes 2-5 seconds, query generation and search take 3-5 seconds, and LLM profile extraction takes 1-2 seconds. The streaming endpoint shows real-time progress for every step.",
  },
  {
    q: "Is my data stored or shared?",
    a: "Analysis results are returned as JSON responses and never persisted on our servers. Each analysis is stateless — we crawl, analyze, and return results immediately. No data is used for training or shared with third parties.",
  },
  {
    q: "Do I need AWS credentials to use the platform?",
    a: "Yes, the LLM analysis layer uses AWS Bedrock (Claude Haiku), so active AWS credentials with Bedrock access are required. Cognito handles authentication. Tavily API key is needed for enriched search results. Competitor search also supports DuckDuckGo which requires no API key.",
  },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-base font-medium text-[#0a2540]">{question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="pb-5 text-sm leading-relaxed text-gray-500">{answer}</div>
      )}
    </div>
  )
}

export default function Landing() {
  const { isAuthenticated } = useAuth()
  return (
    <div className="overflow-hidden">
      {/* ── Hero ── */}
      <section className="relative bg-[#0a2540] text-white overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 60% 50% at 15% 0%, #ff8a65 0%, transparent 55%),
              radial-gradient(ellipse 50% 60% at 5% 100%, #ff6ec7 0%, transparent 55%),
              radial-gradient(ellipse 60% 50% at 45% 30%, #b56cff 0%, transparent 60%),
              radial-gradient(ellipse 80% 60% at 80% 10%, #4cc9f0 0%, transparent 55%),
              radial-gradient(ellipse 60% 70% at 100% 100%, #06d6a0 0%, transparent 60%),
              radial-gradient(ellipse 70% 60% at 50% 100%, #635bff 0%, transparent 65%)
            `,
            filter: "blur(20px) saturate(110%)",
            opacity: 0.7,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: "88px 88px",
            maskImage: "radial-gradient(ellipse 100% 90% at 50% 30%, black 0%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 100% 90% at 50% 30%, black 0%, transparent 75%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-[30%] pointer-events-none"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(10,37,64,0.6) 60%, #f6f9fc 100%)",
          }}
        />

        <div className="relative z-10">
          <nav className="mx-auto flex max-w-7xl items-center px-4 py-5 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[#635bff] text-sm font-bold">
                A
              </span>
              AEO-App<span className="text-white/50">.ai</span>
            </a>
            <div className="ml-auto flex items-center gap-3">
              {isAuthenticated ? (
                <Button
                  size="sm"
                  className="rounded-full bg-[#635bff] px-4 text-white hover:bg-[#5851e8]"
                  asChild
                >
                  <Link to="/dashboard">
                    Dashboard
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Link
                    to="/auth/login"
                    className="rounded-full px-4 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                  <Button
                    size="sm"
                    className="rounded-full bg-[#635bff] px-4 text-white hover:bg-[#5851e8]"
                    asChild
                  >
                    <Link to="/auth/register">
                      Get started
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-32 pt-16 sm:px-6 lg:px-8 md:pb-40 md:pt-24">
          <div className="grid items-center gap-12 md:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                <BarChart3 className="h-3.5 w-3.5" />
                Full Suite Marketing Intelligence &amp; Digital Marketing Platform
              </div>
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
                Dominate every search engine <span className="text-[#635bff]">AI or not.</span>
              </h1>
              <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-white/80 sm:text-xl">
                AI engines now generate 60% of answers without a single link click.
                We analyze your website, surface real competitors across multiple sources,
                track your visibility across ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews —
                then deliver a battle-tested plan to own the top spot in every engine.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {isAuthenticated ? (
                  <Button
                    size="lg"
                    className="rounded-full bg-[#635bff] px-6 text-white hover:bg-[#5851e8]"
                    asChild
                  >
                    <Link to="/dashboard">
                      Go to Dashboard
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="rounded-full bg-[#635bff] px-6 text-white hover:bg-[#5851e8]"
                      asChild
                    >
                      <Link to="/auth/register">
                        Get started free
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10"
                      asChild
                    >
                      <Link to="/auth/login">Sign in</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="hidden md:block">
              <div
                className="overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"
                style={{ transform: "perspective(2000px) rotateY(-4deg) rotateX(3deg)" }}
              >
                <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="flex-1 text-center font-mono text-[11px] text-gray-400">
                    aeo-app.ai/r/acme.com
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Check className="h-3 w-3" />
                    Ready
                  </div>
                </div>
                <div className="p-5 text-sm text-gray-900">
                  <div className="mb-3 flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Visibility &middot; last 30d</span>
                    <span className="font-mono text-xs font-medium text-gray-800">acme.com</span>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2.5 rounded-lg bg-gray-50 p-3">
                    {[
                      { label: "AEO", value: 72, color: "#635bff" },
                      { label: "GEO", value: 58, color: "#0a2540" },
                    ].map((d) => (
                      <div key={d.label} className="flex flex-col items-center">
                        <svg viewBox="0 0 100 100" className="h-20 w-20">
                          <circle cx="50" cy="50" r="38" stroke="#e3e8ee" strokeWidth="6" fill="none" />
                          <circle
                            cx="50" cy="50" r="38"
                            stroke={d.color}
                            strokeWidth="6" fill="none" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 38}
                            strokeDashoffset={2 * Math.PI * 38 * (1 - d.value / 100)}
                            transform="rotate(-90 50 50)"
                            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)" }}
                          />
                        </svg>
                        <span className="mt-1 text-lg font-medium">{d.value}</span>
                        <span className="text-[10px] text-gray-400">{d.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "Citations/wk", value: "14", delta: "+3" },
                      { label: "Share of voice", value: "4.2%", delta: "+0.8%" },
                      { label: "Prompts", value: "500" },
                    ].map((k) => (
                      <div key={k.label} className="rounded-lg bg-gray-50 p-2.5">
                        <div className="text-[10px] text-gray-400">{k.label}</div>
                        <div className="text-sm font-medium">{k.value}</div>
                        {k.delta && <div className="font-mono text-[10px] text-emerald-600">{k.delta}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="mb-1 flex justify-between text-[10px] font-medium text-gray-400">
                      <span>Engine</span>
                      <span>Visibility</span>
                    </div>
                    {[
                      { name: "ChatGPT", v: 72 },
                      { name: "Perplexity", v: 58 },
                      { name: "Google AI Overviews", v: 44 },
                      { name: "Claude", v: 52 },
                      { name: "Gemini", v: 38 },
                    ].map((e, i) => (
                      <div
                        key={e.name}
                        className="flex items-center gap-3 py-1.5 text-xs"
                        style={{ animation: `rowIn 0.5s 0.${i}s forwards` }}
                      >
                        <span className="w-28 font-medium text-gray-700">{e.name}</span>
                        <span className="h-1 flex-1 rounded-full bg-gray-200">
                          <span
                            className="block h-full rounded-full bg-[#635bff]"
                            style={{ width: `${e.v}%` }}
                          />
                        </span>
                        <span className="w-8 text-right font-mono text-[11px] text-gray-400">{e.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-20 -mt-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
            <h3 className="text-xl font-semibold text-[#0a2540] sm:text-2xl">
              Ready to dominate your market?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Pick a plan and let us handle the rest — from site optimization to blogs, social media, videos, and beyond.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                className="rounded-full bg-[#635bff] px-7 text-white hover:bg-[#5851e8]"
                asChild
              >
                <Link to="/offers">
                  Know our offers
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-gray-200 px-6"
                asChild
              >
                <Link to="/auth/register">
                  Create free account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="bg-[#f6f9fc] pb-16 pt-28 sm:pb-24 sm:pt-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
              <span className="font-mono text-gray-400">01</span>
              <span>Products</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl lg:text-5xl">
              Everything you need to <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>own your market</em>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-500 sm:text-lg">
              Understand your competitive landscape, dominate AI and traditional search, and get a
              clear roadmap to the top — all from a single platform.
            </p>
          </motion.div>

          <motion.div
            className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            variants={stagger}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  className="group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[#0a2540]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    {feature.description}
                  </p>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="bg-white pb-16 pt-20 sm:pb-24 sm:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-14 max-w-2xl text-center"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
              <span className="font-mono text-gray-400">02</span>
              <span>Who it's for</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl lg:text-5xl">
              Built for <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>teams that compete</em>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-500 sm:text-lg">
              Whether you're a solo founder optimizing your first AI prompt or an enterprise team
              monitoring a portfolio of brands — our platform adapts to your workflow.
            </p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((uc) => {
              const Icon = uc.icon
              return (
                <motion.div
                  key={uc.title}
                  variants={fadeUp}
                  initial="initial"
                  whileInView="whileInView"
                  viewport={{ once: true }}
                  className="rounded-2xl border border-gray-100 bg-[#f6f9fc] p-6 transition hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#635bff]/10 text-[#635bff]">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#0a2540]">{uc.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{uc.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── By the numbers ── */}
      <section className="bg-[#0a2540] text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mb-12 grid items-end gap-12 md:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
                <span className="font-mono text-white/40">03</span>
                <span>By the numbers</span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                Built for <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>ambitious brands</em>
              </h2>
            </div>
            <p className="text-base leading-relaxed text-white/70 sm:text-lg">
              From startups to established enterprises — we help businesses get found, get chosen,
              and get ahead of the competition in the age of AI-generated answers.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              { value: "50+", label: "Prompts tracked per domain across AI engines, refreshed daily" },
              { value: "10+", label: "AI and search engines monitored for citation and visibility" },
              { value: "<10s", label: "Average analysis time — crawl to structured profile in seconds" },
              { value: "99%", label: "Domain deduplication accuracy via multi-source cross-referencing" },
            ].map((s) => (
              <div key={s.label} className="border-t border-white/20 pt-5">
                <div className="text-4xl font-medium tracking-tight sm:text-5xl">{s.value}</div>
                <div className="mt-3 text-sm leading-relaxed text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-white pb-16 pt-20 sm:pb-24 sm:pt-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-14 max-w-2xl text-center sm:mb-20"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
              <span className="font-mono text-gray-400">04</span>
              <span>How it works</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl lg:text-5xl">
              From website to <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>domination</em> in minutes
            </h2>
          </motion.div>

          {[
            {
              eyebrow: "1. Analyze",
              title: "Enter a URL. Get a complete company profile.",
              body: "Our AI crawls your website and generates targeted research queries against Tavily and DuckDuckGo. The combined data is analyzed by Claude Haiku to extract your products, audience, industry category, and relevant search terms — all streamed to you in real time.",
            },
            {
              eyebrow: "2. Discover",
              title: "Find real competitors — not noise.",
              body: "Select the attributes that define your market (products, audience, categories, custom terms). Our engine runs multi-source searches across Tavily and DuckDuckGo, de-duplicates by domain, strips social media and Wikipedia, and applies an LLM filter that removes blogs, listicles, and non-company pages. What remains is a clean, actionable competitor list.",
            },
            {
              eyebrow: "3. Track & Optimize",
              title: "Monitor visibility and execute your growth plan.",
              body: "See how often your brand is cited across ChatGPT, Google AI Overviews, Perplexity, Claude, and Gemini. Track share of voice, citation trends, and prompt appearance rates. Use our structured insights to prioritize content changes, technical fixes, and positioning adjustments that move the needle.",
            },
          ].map((step, i) => (
            <div
              key={step.eyebrow}
              className={`flex flex-col gap-8 border-t border-gray-100 py-12 sm:gap-14 sm:py-16 ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"} md:items-center md:justify-between`}
            >
              <div className="md:w-[45%]">
                <div className="mb-3 text-sm font-medium text-[#635bff]">{step.eyebrow}</div>
                <h3 className="text-2xl font-semibold tracking-tight text-[#0a2540] sm:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-gray-500">
                  {step.body}
                </p>
              </div>
              <div
                className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br shadow-md md:w-[48%] ${
                  i === 0
                    ? "from-[#635bff]/5 to-white"
                    : i === 1
                      ? "from-[#ff6ec7]/5 to-white"
                      : "from-[#06d6a0]/5 to-white"
                }`}
              >
                <div className="w-4/5 max-w-xs rounded-xl bg-white p-5 shadow-lg">
                  {i === 0 && (
                    <div className="font-mono text-xs text-gray-400">
                      <div className="mb-2 text-sm font-semibold text-gray-900">Acme Corp</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div><span className="text-gray-400">Products</span><br />CRM, Analytics</div>
                        <div><span className="text-gray-400">Audience</span><br />Enterprise</div>
                        <div><span className="text-gray-400">Category</span><br />SaaS</div>
                        <div><span className="text-gray-400">Terms</span><br />5 keywords</div>
                      </div>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {["CRM", "Analytics", "Enterprise", "SaaS", "customer+"].map((t) => (
                        <span
                          key={t}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            t === "CRM"
                              ? "bg-[#635bff] text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {i === 2 && (
                    <div className="space-y-2 text-xs">
                      {[
                        { name: "RivalOne", domain: "rivalone.com", v: 72 },
                        { name: "CompetitorCo", domain: "competitor.co", v: 58 },
                        { name: "MarketPeer", domain: "marketpeer.com", v: 44 },
                      ].map((c) => (
                        <div key={c.name} className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5">
                          <div>
                            <span className="font-medium text-gray-900">{c.name}</span>
                            <span className="ml-2 font-mono text-[10px] text-gray-400">{c.domain}</span>
                          </div>
                          <span className="font-mono text-[10px] text-emerald-600">{c.v}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t bg-[#f6f9fc] pb-20 pt-20 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mb-12 text-center"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
              <span className="font-mono text-gray-400">05</span>
              <span>FAQ</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
              Frequently asked <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>questions</em>
            </h2>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-gray-200 bg-white px-6 shadow-sm"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {faqs.map((faq) => (
              <FAQItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </motion.div>

          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500">
              Still have questions?{" "}
              <a href="mailto:support@aeo-app.ai" className="font-medium text-[#635bff] underline-offset-2 hover:underline">
                Contact us
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
              Your competitors are already investing in AI visibility.
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              The shift from search to answers is happening now. Start your journey to the top of every engine today.
            </p>
            <div className="mt-8">
              <Button
                size="lg"
                className="rounded-full bg-[#635bff] px-7 text-white hover:bg-[#5851e8]"
                asChild
              >
                <Link to={isAuthenticated ? "/dashboard" : "/auth/register"}>
                  {isAuthenticated ? "Go to Dashboard" : "Get started free"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#635bff]/10 text-[#635bff] text-xs font-bold">
                A
              </span>
              AEO-App.ai &mdash; Full Suite Marketing Intelligence &amp; Digital Marketing Platform
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              {isAuthenticated ? (
                <Link to="/dashboard" className="transition hover:text-gray-600">Dashboard</Link>
              ) : (
                <>
                  <Link to="/auth/login" className="transition hover:text-gray-600">Sign in</Link>
                  <Link to="/auth/register" className="transition hover:text-gray-600">Register</Link>
                </>
              )}
            </div>
          </div>
          <div className="mt-4 text-center text-xs text-gray-300 sm:text-left">
            &copy; {new Date().getFullYear()} AEO-App. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
