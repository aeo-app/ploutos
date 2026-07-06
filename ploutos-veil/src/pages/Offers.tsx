import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { useAuth } from "@/hooks/use-auth"
import { ArrowRight, Check, Sparkles, Users, FileText, TrendingUp, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"

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

const plans = [
  {
    name: "Starter",
    label: "Basic Report",
    analyses: "5",
    monthly: 40,
    annual: 28,
    popular: false,
    users: "1 user",
    description: "Essential SEO audit with actionable insights for small businesses and solopreneurs.",
    icon: FileText,
  },
  {
    name: "Pro",
    label: "Growth Report",
    analyses: "1/day",
    monthly: 150,
    annual: 105,
    popular: true,
    users: "3 users",
    description: "Full SEO + GEO + AEO audit with competitor intelligence and visibility tracking.",
    icon: TrendingUp,
  },
  {
    name: "Unlimited",
    label: "Enterprise Report",
    analyses: "Unlimited",
    monthly: 400,
    annual: 280,
    popular: false,
    users: "Unlimited users",
    description: "Enterprise-scale monitoring with multi-domain portfolio management and priority support.",
    icon: Layers,
  },
]

const cardFeatures: Record<string, { label: string; sub?: string }[]> = {
  Starter: [
    { label: "Full website crawl & AI analysis" },
    { label: "Structured company profile", sub: "Products, audience, categories, search terms" },
    { label: "SEO compliance score & summary" },
    { label: "Strengths & weaknesses analysis" },
    { label: "Prioritized SEO recommendations", sub: "Immediate, short-term, medium-term, long-term" },
    { label: "On-page SEO assessment", sub: "Title, meta, H1, keyword placement scores" },
    { label: "Content depth evaluation" },
    { label: "Technical SEO audit", sub: "Core Web Vitals, page speed, mobile readiness" },
    { label: "Monthly performance report" },
  ],
  Pro: [
    { label: "Everything in Starter" },
    { label: "GEO compliance score & summary", sub: "AI engine readiness assessment" },
    { label: "AEO compliance score & summary", sub: "Featured snippet & voice search readiness" },
    { label: "15+ criterion scores with detailed breakdowns", sub: "Individual scores per dimension with analysis" },
    { label: "Multi-source competitor search", sub: "Tavily + DuckDuckGo parallel search" },
    { label: "LLM-filtered competitor intelligence" },
    { label: "AI engine visibility tracking", sub: "ChatGPT, Perplexity, Claude, Gemini, Google AIO" },
    { label: "Citation & share of voice trends" },
    { label: "FAQ schema & PAA opportunity analysis" },
    { label: "Conversational content optimization" },
    { label: "E-E-A-T signal assessment" },
    { label: "Real-time streaming analysis" },
    { label: "3 team seats with shared reports" },
  ],
  Unlimited: [
    { label: "Everything in Pro" },
    { label: "Unlimited analyses" },
    { label: "Portfolio / multi-domain monitoring" },
    { label: "Custom search source plugins" },
    { label: "Priority processing queue" },
    { label: "Unlimited team accounts" },
    { label: "Dedicated support & SLA" },
    { label: "White-label report export" },
    { label: "Add-on services available", sub: "Blog writing, content creation, marketing execution — billed separately" },
  ],
}

const planFeatures = [
  { label: "Website crawl & AI analysis", values: [true, true, true] },
  { label: "Structured company profile", sub: "Products, audience, categories, terms", values: [true, true, true] },
  { label: "SEO compliance score & summary", values: [true, true, true] },
  { label: "Strengths & weaknesses analysis", values: [true, true, true] },
  { label: "Prioritized action plan", sub: "Immediate → short → medium → long term", values: [true, true, true] },
  { label: "On-page SEO audit", sub: "Title, meta, H1, keyword scores", values: [true, true, true] },
  { label: "Content depth evaluation", values: [true, true, true] },
  { label: "Technical SEO audit", sub: "Core Web Vitals, page speed, mobile", values: [true, true, true] },
  { label: "GEO compliance score", sub: "AI engine readiness (ChatGPT, Perplexity, etc.)", values: [false, true, true] },
  { label: "AEO compliance score", sub: "Featured snippet & voice search readiness", values: [false, true, true] },
  { label: "15+ criterion scores with detail", sub: "Individual dimension scores + analysis", values: [false, true, true] },
  { label: "FAQ / PAA opportunity analysis", sub: "Schema gaps and question targeting", values: [false, true, true] },
  { label: "E-E-A-T signal assessment", sub: "Expertise, authority, trustworthiness gaps", values: [false, true, true] },
  { label: "Multi-source competitor search", sub: "Tavily + DuckDuckGo", values: [false, true, true] },
  { label: "LLM-filtered competitor intelligence", values: [false, true, true] },
  { label: "AI engine visibility tracking", sub: "Citations across 10+ engines", values: [false, true, true] },
  { label: "Citation & share of voice trends", values: [false, true, true] },
  { label: "Real-time streaming analysis", values: [false, true, true] },
  { label: "Multi-domain portfolio monitoring", values: [false, false, true] },
  { label: "Custom search source plugins", values: [false, false, true] },
  { label: "White-label report export", values: [false, false, true] },
  { label: "Priority processing & dedicated SLA", values: [false, false, true] },
  { label: "Add-on services", sub: "Blog writing, content creation, marketing execution — billed separately", values: [false, false, true] },
]

export default function Offers() {
  const { isAuthenticated } = useAuth()
  const [pricingCycle, setPricingCycle] = useState("annual")
  return (
    <div className="overflow-hidden">
      <section className="relative bg-[#0a2540] overflow-hidden">
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
            opacity: 0.5,
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

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-20 text-center sm:px-6 lg:px-8">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
            <Sparkles className="h-3.5 w-3.5" />
            Plans &amp; Pricing
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Pick the plan that <span className="text-[#635bff]">fits your scale</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
            From a focused SEO snapshot to full SEO + GEO + AEO intelligence with competitor tracking —
            automated reports inspired by real agency-grade audits.
          </p>
          <div className="mt-6 inline-flex rounded-full border border-white/20 bg-white/10 p-1">
            <button
              onClick={() => setPricingCycle("monthly")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${pricingCycle === "monthly" ? "bg-white text-[#0a2540] shadow-sm" : "text-white/80"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPricingCycle("annual")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${pricingCycle === "annual" ? "bg-white text-[#0a2540] shadow-sm" : "text-white/80"}`}
            >
              Annual <span className="ml-1 rounded bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">−30%</span>
            </button>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <motion.div
            className="grid gap-6 md:grid-cols-3"
            variants={stagger}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            {plans.map((plan) => {
              const Icon = plan.icon
              return (
                <motion.div
                  key={plan.name}
                  variants={fadeUp}
                  className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
                    plan.popular
                      ? "border-[#635bff] shadow-[0_0_0_1px_#635bff,0_7px_14px_0_rgba(60,66,87,0.1)]"
                      : "border-gray-200"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-6 rounded-full bg-[#635bff] px-3 py-1 text-xs font-medium text-white">
                      Most popular
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#635bff]/10 text-[#635bff]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#635bff]">{plan.name}</div>
                      <div className="text-xs text-gray-400">{plan.label}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight text-[#0a2540]">${pricingCycle === "annual" ? plan.annual : plan.monthly}</span>
                    <span className="ml-1 text-sm text-gray-400">/month</span>
                    {pricingCycle === "annual" && (
                      <div className="mt-1 text-xs font-medium text-emerald-600">
                        Save ${((plan.monthly - plan.annual) * 12).toLocaleString()}/yr
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span className="font-medium text-[#0a2540]">{plan.analyses}{plan.name !== "Unlimited" && !plan.analyses.includes("/") ? " analyses" : ""}</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {plan.users}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">{plan.description}</p>

                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-gray-100 pt-5 text-sm">
                    {cardFeatures[plan.name].map((feat) => (
                      <li key={feat.label} className="flex items-start gap-2.5 text-gray-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <div>
                          <span>{feat.label}</span>
                          {feat.sub && <span className="block text-[11px] text-gray-400">{feat.sub}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="mt-6 w-full rounded-full"
                    variant={plan.popular ? "default" : "outline"}
                    asChild
                  >
                    <Link to={isAuthenticated ? "/dashboard" : plan.name === "Unlimited" ? "/contact" : "/auth/register"}>
                      {isAuthenticated ? "Go to Dashboard" : plan.name === "Unlimited" ? "Contact us" : "Get started"}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      <section className="bg-[#f6f9fc] py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={fadeUp}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
          >
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#635bff]">
              Feature comparison
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
              Every feature, every plan
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Start with the basics and scale to full-spectrum AI search intelligence.
            </p>
          </motion.div>

          <div className="mt-14 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-6 py-4 font-semibold text-[#0a2540]">Feature</th>
                  {plans.map((p) => (
                    <th key={p.name} className="px-6 py-4 text-center font-semibold text-[#0a2540]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planFeatures.map((f, i) => (
                  <tr key={f.label} className={i < planFeatures.length - 1 ? "border-b border-gray-100" : ""}>
                    <td className="px-6 py-5">
                      <div className="font-medium text-[#0a2540]">{f.label}</div>
                      {f.sub && <div className="mt-0.5 text-xs text-gray-400">{f.sub}</div>}
                    </td>
                    {f.values.map((included, pi) => (
                      <td key={pi} className="px-6 py-5 text-center">
                        {included ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50">
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          </span>
                        ) : (
                          <span className="text-gray-300">&mdash;</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Quotes ── */}
      <section className="bg-[#0a2540]">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/70">
            <span className="font-mono text-white/40">Trusted by teams</span>
          </div>
          <h2 className="max-w-[20ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Teams that <em className="not-italic font-normal" style={{ fontFamily: "'Georgia', serif" }}>chose to show up</em> in the answer.
          </h2>
          <div className="mt-12 grid items-center gap-12 md:grid-cols-[1.4fr_1fr] lg:gap-20">
            <div>
              <p className="text-2xl leading-snug tracking-tight text-white/90 sm:text-3xl" style={{ fontFamily: "'Georgia', serif", fontStyle: "italic", fontWeight: 300 }}>
                "aeo-app is the only tool that told us which paragraph the answer engines actually quote. That changed everything about how we brief writers."
              </p>
              <div className="mt-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#635bff] to-[#b56cff] text-sm font-semibold text-white">
                  DM
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Diego Marín</div>
                  <div className="text-sm text-white/60">Director, SEO/AEO at Mercury</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 p-6" style={{ background: "linear-gradient(135deg, rgba(99,91,255,0.18), rgba(76,201,240,0.10))" }}>
              {[
                { v: "9/9", l: "Major engines won, in one quarter" },
                { v: "+2.3pt", l: "Share of voice gained on key prompts" },
                { v: "12 weeks", l: "End-to-end implementation" },
              ].map((s) => (
                <div key={s.l} className="border-b border-white/10 py-4 last:border-0 last:pb-0 first:pt-0">
                  <div className="text-2xl font-medium tracking-tight text-white sm:text-3xl">{s.v}</div>
                  <div className="mt-1 text-sm text-white/60">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div variants={fadeUp} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
              Not sure which plan fits?
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Start with a free account, run your first analysis, and upgrade when you're ready to scale.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button className="rounded-full bg-[#635bff] px-7 text-white hover:bg-[#5851e8]" asChild>
                <Link to={isAuthenticated ? "/dashboard" : "/auth/register"}>
                  {isAuthenticated ? "Go to Dashboard" : "Create free account"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="rounded-full border-gray-200 px-6" asChild>
                <Link to={isAuthenticated ? "/dashboard" : "/"}>
                  {isAuthenticated ? "Dashboard" : "Back to home"}
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
