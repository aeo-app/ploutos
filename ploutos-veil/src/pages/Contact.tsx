import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Check, Mail, MessageSquare, Send, User } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"


const plans = [
  { name: "Starter", price: "$40/mo", analyses: "5 analyses" },
  { name: "Pro", price: "$150/mo", analyses: "50 analyses" },
  { name: "Unlimited", price: "$400/mo", analyses: "Unlimited" },
]

export default function Contact() {
  const { isAuthenticated } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [plan, setPlan] = useState("")
  const [sent, setSent] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
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
            <Mail className="h-3.5 w-3.5" />
            Get in touch
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Contact us for a <span className="text-[#635bff]">best quote</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
            Tell us about your needs and we'll put together a custom plan — whether
            you're scaling up or exploring enterprise options.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg sm:p-12">
            {sent ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <Check className="h-7 w-7 text-emerald-500" />
                </div>
                <h2 className="mt-5 text-2xl font-semibold text-[#0a2540]">Thanks for reaching out!</h2>
                <p className="mt-2 text-gray-500">
                  We'll review your message and get back to you within 24 hours with a custom quote.
                </p>
                <Button
                  className="mt-6 rounded-full bg-[#635bff] px-7 text-white hover:bg-[#5851e8]"
                  asChild
                >
                  <Link to={isAuthenticated ? "/dashboard" : "/"}>
                    {isAuthenticated ? "Go to Dashboard" : "Back to home"}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="plan" className="text-sm font-medium text-[#0a2540]">Interested plan</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {plans.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setPlan(p.name)}
                        className={`rounded-xl border p-3 text-left transition ${
                          plan === p.name
                            ? "border-[#635bff] bg-[#635bff]/5 ring-1 ring-[#635bff]"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="text-sm font-semibold text-[#0a2540]">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-[#0a2540]">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="name"
                      placeholder="Your name"
                      className="rounded-xl border-gray-200 pl-10"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-[#0a2540]">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      className="rounded-xl border-gray-200 pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="message" className="text-sm font-medium text-[#0a2540]">Message</Label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <textarea
                      id="message"
                      placeholder="Tell us about your requirements, scale, and any specific needs..."
                      className="flex min-h-[140px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pl-10 text-sm ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#635bff] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    className="w-full rounded-full bg-[#635bff] py-6 text-white hover:bg-[#5851e8]"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Request a quote
                  </Button>
                  <p className="mt-3 text-center text-xs text-gray-400">
                    We'll respond within 24 hours. No obligation, no spam.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#f6f9fc] pb-20 pt-28 sm:pb-28 sm:pt-36">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0a2540]">Email us</h3>
              <p className="mt-1 text-sm text-gray-500">
                <a href="mailto:sales@aeo-app.ai" className="text-[#635bff] underline-offset-2 hover:underline">
                  sales@aeo-app.ai
                </a>
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0a2540]">Live chat</h3>
              <p className="mt-1 text-sm text-gray-500">
                Chat with our team during business hours.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
                <User className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0a2540]">Enterprise</h3>
              <p className="mt-1 text-sm text-gray-500">
                Custom plans for large-scale deployments and agencies.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
