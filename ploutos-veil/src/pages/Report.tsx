import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Download, CreditCard, FileText, Shield, Lock, AlertCircle, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const plans = [
  { name: "Starter Report", price: "$40", period: "one-time" },
  { name: "Full Report", price: "$150", period: "one-time", popular: true },
  { name: "Enterprise Report", price: "$400", period: "one-time" },
]

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2)
  return digits
}

export default function Report() {
  const [selectedPlan, setSelectedPlan] = useState("Full Report")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [company, setCompany] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)

    const cardDigits = cardNumber.replace(/\D/g, "")
    const nameFilled = name.trim().length > 0
    const emailFilled = email.trim().length > 0
    const expiryFilled = expiry.length === 5
    const cvcFilled = cvc.length === 3

    if (!nameFilled || !emailFilled || !expiryFilled || !cvcFilled) {
      setError("Please fill in all required fields.")
      return
    }

    if (cardDigits.length < 13 || cardDigits.length > 16) {
      setError("Invalid credit card number. Please check and try again.")
      return
    }

    const firstDigit = cardDigits[0]
    if (firstDigit === "0" || firstDigit === "1") {
      setError("Invalid credit card number. Please check and try again.")
      return
    }

    setError("Invalid credit card number. Please check and try again.")
  }

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

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-20 text-center sm:px-6 lg:px-8">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
            <FileText className="h-3.5 w-3.5" />
            Market Intelligence Report
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Get your full <span className="text-[#635bff]">market intelligence</span> report
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
            Deep-dive competitive analysis with AI engine visibility tracking, structured competitor
            intelligence, and a prioritized action plan — delivered as a polished PDF.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
            {/* ── Sample Report ── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
                <Download className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-[#0a2540]">Download sample report</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                See exactly what you'll get — a full 15-page sample report covering website analysis,
                SEO/GEO/AEO scores, competitor intelligence, and AI engine visibility tracking across
                ChatGPT, Perplexity, Claude, and Gemini.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-gray-500">
                {[
                  "Full website crawl & structured profile",
                  "SEO, GEO & AEO compliance scores",
                  "Multi-source competitor discovery",
                  "AI engine visibility dashboard",
                  "Prioritized optimization roadmap",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full rounded-full"
                variant="outline"
                asChild
              >
                <a href="/sample-report.pdf" target="_blank">
                  <Download className="mr-2 h-4 w-4" />
                  Download sample PDF
                </a>
              </Button>
            </div>

            {/* ── Purchase Form ── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-8">
              <div className="flex items-center gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[#0a2540]">Purchase full report</h2>
                  <p className="text-sm text-gray-400">
                    Get the complete analysis delivered instantly.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                {/* Plan selector */}
                <div>
                  <Label className="text-sm font-medium text-[#0a2540]">Report type</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {plans.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setSelectedPlan(p.name)}
                        className={`relative rounded-xl border p-3 text-left transition ${
                          selectedPlan === p.name
                            ? "border-[#635bff] bg-[#635bff]/5 ring-1 ring-[#635bff]"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {p.popular && (
                          <div className="absolute -top-2 left-3 rounded-full bg-[#635bff] px-2 py-0.5 text-[9px] font-medium text-white">
                            Popular
                          </div>
                        )}
                        <div className="text-xs font-semibold text-[#0a2540]">{p.name}</div>
                        <div className="mt-0.5 text-xs text-gray-400">{p.price} / {p.period}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name + email */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-[#0a2540]">Full name</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      className="rounded-xl border-gray-200"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-[#0a2540]">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      className="rounded-xl border-gray-200"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Company */}
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-sm font-medium text-[#0a2540]">
                    Company <span className="text-gray-400">(optional)</span>
                  </Label>
                  <Input
                    id="company"
                    placeholder="Acme Inc."
                    className="rounded-xl border-gray-200"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                {/* Card details */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-[#0a2540]">
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                    Secure payment
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="card-number" className="text-sm font-medium text-[#0a2540]">Card number</Label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                          id="card-number"
                          placeholder="4242 4242 4242 4242"
                          className="rounded-xl border-gray-200 pl-10 font-mono tracking-wider"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="expiry" className="text-sm font-medium text-[#0a2540]">Expiry date</Label>
                        <Input
                          id="expiry"
                          placeholder="MM/YY"
                          className="rounded-xl border-gray-200 font-mono"
                          value={expiry}
                          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cvc" className="text-sm font-medium text-[#0a2540]">CVC</Label>
                        <Input
                          id="cvc"
                          placeholder="123"
                          className="rounded-xl border-gray-200 font-mono"
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Payment successful! Your report will be delivered to {email}.</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full rounded-full bg-[#635bff] py-6 text-white hover:bg-[#5851e8]"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Pay {plans.find((p) => p.name === selectedPlan)?.price} &amp; download report
                </Button>

                <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Encrypted
                  </span>
                  <Shield className="h-3 w-3" />
                  <span>256-bit SSL</span>
                  <span>&middot;</span>
                  <span>No storage</span>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f6f9fc] pb-20 pt-28 sm:pb-28 sm:pt-36">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
              What's inside your report
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Every report is generated in real-time from your website analysis and our multi-source
              competitive research engine.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {[
              {
                title: "Company Profile",
                items: ["Official business name & domain", "Industry classification", "Product & service catalog", "Target audience segments", "Business categories"],
              },
              {
                title: "SEO Compliance",
                items: ["On-page SEO scoring", "Core Web Vitals audit", "Content depth analysis", "Keyword placement audit", "Technical SEO checklist"],
              },
              {
                title: "GEO & AEO Scores",
                items: ["AI engine readiness score", "Featured snippet potential", "Conversational query fit", "FAQ / PAA opportunity map", "E-E-A-T signal assessment"],
              },
              {
                title: "Competitor Intel",
                items: ["Multi-source competitor list", "Domain & description cleaning", "LLM-filtered noise removal", "Grouped by product/audience", "Share of voice benchmarks"],
              },
            ].map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h3 className="mb-3 text-base font-semibold text-[#0a2540]">{section.title}</h3>
                <ul className="space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-500">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-[#0a2540] sm:text-4xl">
            Not ready to purchase?
          </h2>
          <p className="mt-3 text-base text-gray-500">
            Try a free analysis first. Enter any company URL and see what our engine can uncover — no credit card required.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button className="rounded-full bg-[#635bff] px-7 text-white hover:bg-[#5851e8]" asChild>
              <Link to="/auth/register">
                Create free account
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="rounded-full border-gray-200 px-6" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
