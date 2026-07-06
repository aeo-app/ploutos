import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  CalendarClock,
  FileDown,
  Globe,
  Hash,
  ListTodo,
  Target,
  Users,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ScheduleResponse, SchedulePost } from "@/types/api"

interface Props {
  data: ScheduleResponse
}

const MONTH_META = [
  {
    id: "foundation",
    label: "Month 1 — Foundation",
    subtitle:
      "Build technical eligibility for AI citation. Fix SEO issues. Launch content infrastructure.",
    accent: "from-blue-500/10 to-blue-500/5",
    headerBg: "bg-blue-50 dark:bg-blue-950/40",
    rowBg: "even:bg-blue-50/30 dark:even:bg-blue-950/10",
  },
  {
    id: "growth",
    label: "Month 2 — Growth",
    subtitle:
      "Scale content, activate all social channels, build AEO citations. Target: appearing in 2+ AI engines.",
    accent: "from-emerald-500/10 to-emerald-500/5",
    headerBg: "bg-emerald-50 dark:bg-emerald-950/40",
    rowBg: "even:bg-emerald-50/30 dark:even:bg-emerald-950/10",
  },
  {
    id: "acceleration",
    label: "Month 3 — Acceleration",
    subtitle:
      "Full video series, maximum AI citation coverage, establish systems for ongoing growth beyond day 90.",
    accent: "from-purple-500/10 to-purple-500/5",
    headerBg: "bg-purple-50 dark:bg-purple-950/40",
    rowBg: "even:bg-purple-50/30 dark:even:bg-purple-950/10",
  },
]

const TEAM_COLORS: Record<string, string> = {
  Marketing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Developer: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Social Media": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  Auto: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Video: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

const AUTOMATION_LABELS: Record<string, { label: string; short: string; color: string }> = {
  "✅ Full automation": {
    label: "✅ Full automation — runs without human input",
    short: "✅ Auto",
    color: "text-green-600 dark:text-green-400",
  },
  "⚡ Partial": {
    label: "⚡ Partial — AI drafts, human approves",
    short: "⚡ Partial",
    color: "text-amber-600 dark:text-amber-400",
  },
  "★ AI-assisted": {
    label: "★ AI-assisted — human leads, AI accelerates",
    short: "★ AI",
    color: "text-blue-600 dark:text-blue-400",
  },
}

function AutomationBadge({ level }: { level: string }) {
  const info = AUTOMATION_LABELS[level]
  if (!info) return <span className="text-xs">{level}</span>
  return (
    <span className={`whitespace-nowrap text-[10px] font-medium ${info.color}`} title={info.label}>
      {info.short}
    </span>
  )
}

function TeamBadge({ team }: { team: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${TEAM_COLORS[team] || "bg-gray-100 text-gray-700"}`}
    >
      {team}
    </span>
  )
}

function OverviewSection({ data }: { data: ScheduleResponse }) {
  const posts = data.schedule
  const phases = ["foundation", "growth", "acceleration"]

  const phaseStats = phases.map((ph) => {
    const phasePosts = posts.filter((p) => p.phase === ph)
    const total = phasePosts.length
    const auto = phasePosts.filter((p) => p.automation_level?.startsWith("✅")).length
    const partial = phasePosts.filter((p) => p.automation_level?.startsWith("⚡")).length
    const assisted = phasePosts.filter((p) => p.automation_level?.startsWith("★")).length
    const estHours = phasePosts.reduce((s, p) => s + (p.est_hours || 0), 0)
    return { phase: ph, total, auto, partial, assisted, estHours }
  })

  const grandTotal = phaseStats.reduce((s, p) => s + p.total, 0)
  const grandAuto = phaseStats.reduce((s, p) => s + p.auto, 0)
  const grandPartial = phaseStats.reduce((s, p) => s + p.partial, 0)
  const grandAssisted = phaseStats.reduce((s, p) => s + p.assisted, 0)
  const grandHours = phaseStats.reduce((s, p) => s + p.estHours, 0)

  const kpi = data.strategy?.kpis
  const tools = [
    { name: "Claude (Anthropic)", purpose: "Content drafts, captions, analysis", cost: "S$25–50" },
    { name: "Buffer / Meta Business Suite", purpose: "Social scheduling", cost: "S$30–50" },
    { name: "Canva Pro + AI", purpose: "Social graphics, carousels, infographics", cost: "S$20" },
    { name: "CapCut / Descript", purpose: "Auto-captions on videos", cost: "S$0–20" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-5">
        <div className="flex flex-wrap items-center gap-2 text-lg font-bold tracking-tight">
          <Globe className="h-5 w-5 text-primary" />
          {data.company_name} — {data.duration_days}-Day Content Scheduler
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.start_date}–{data.end_date} · {data.platforms.length} platforms · Prepared by AEO-APP
        </p>
      </div>

      {/* Phase Summary Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListTodo className="h-4 w-4 text-primary" /> Phase Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="p-3 font-medium">Phase</th>
                  <th className="p-3 font-medium">Weeks</th>
                  <th className="p-3 font-medium text-right">Total</th>
                  <th className="p-3 font-medium text-right">✅ Full Auto</th>
                  <th className="p-3 font-medium text-right">⚡ Partial</th>
                  <th className="p-3 font-medium text-right">★ AI-Assisted</th>
                  <th className="p-3 font-medium text-right">Est. Hours</th>
                </tr>
              </thead>
              <tbody>
                {phaseStats.map((ps) => {
                  const meta = MONTH_META.find((m) => m.id === ps.phase)
                  const weekRange =
                    ps.phase === "foundation" ? "Wks 1–4" : ps.phase === "growth" ? "Wks 5–8" : "Wks 9–12"
                  return (
                    <tr key={ps.phase} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium capitalize">{meta?.label || ps.phase}</td>
                      <td className="p-3 text-muted-foreground">{weekRange}</td>
                      <td className="p-3 text-right font-medium">{ps.total}</td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">{ps.auto}</td>
                      <td className="p-3 text-right text-amber-600 dark:text-amber-400">{ps.partial}</td>
                      <td className="p-3 text-right text-blue-600 dark:text-blue-400">{ps.assisted}</td>
                      <td className="p-3 text-right text-muted-foreground">~{Math.round(ps.estHours)} hrs</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 font-semibold">
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 text-muted-foreground">Weeks 1–12</td>
                  <td className="p-3 text-right">{grandTotal}</td>
                  <td className="p-3 text-right text-green-600 dark:text-green-400">{grandAuto}</td>
                  <td className="p-3 text-right text-amber-600 dark:text-amber-400">{grandPartial}</td>
                  <td className="p-3 text-right text-blue-600 dark:text-blue-400">{grandAssisted}</td>
                  <td className="p-3 text-right text-muted-foreground">~{Math.round(grandHours)} hrs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Automation Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✅</span>
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">Full automation</p>
                <p className="text-muted-foreground">Runs without human input once set up.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-600">⚡</span>
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">Partial automation</p>
                <p className="text-muted-foreground">AI drafts, human approves. Saves 50–70% time.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-blue-600">★</span>
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-400">AI-assisted</p>
                <p className="text-muted-foreground">Human leads, AI accelerates. Saves 25–40% time.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Targets */}
      {kpi && kpi.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" /> {data.duration_days}-Day KPI Targets
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="p-3 font-medium">KPI</th>
                    <th className="p-3 font-medium text-right">Month 1</th>
                    <th className="p-3 font-medium text-right">Month 2</th>
                    <th className="p-3 font-medium text-right">Month 3</th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.map((k: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium capitalize">
                        {Object.keys(k).filter((key) => key !== "month")[0]?.replace(/_/g, " ") || "Metric"}
                      </td>
                      <td className="p-3 text-right">{k.month === 1 ? Object.values(k).slice(1).join(", ") : "—"}</td>
                      <td className="p-3 text-right">{k.month === 2 ? Object.values(k).slice(1).join(", ") : "—"}</td>
                      <td className="p-3 text-right">{k.month === 3 ? Object.values(k).slice(1).join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Tool Stack */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" /> AI Tool Stack
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="p-3 font-medium">Tool</th>
                  <th className="p-3 font-medium">Purpose</th>
                  <th className="p-3 font-medium text-right">Cost/month</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3 text-muted-foreground">{t.purpose}</td>
                    <td className="p-3 text-right">{t.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MonthSection({
  phase,
  posts,
}: {
  phase: string
  posts: SchedulePost[]
}) {
  const meta = MONTH_META.find((m) => m.id === phase)
  if (!meta || posts.length === 0) return null

  const weekStart = phase === "foundation" ? 1 : phase === "growth" ? 5 : 9
  const weekEnd = phase === "foundation" ? 4 : phase === "growth" ? 8 : 12

  return (
    <Card className="overflow-hidden">
      <div className={`bg-gradient-to-r ${meta.accent} p-4`}>
        <h3 className="text-sm font-bold">{meta.label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          Weeks {weekStart}–{weekEnd} · {posts.length} tasks
        </p>
      </div>

      <div className="px-4 py-2 text-[10px] text-muted-foreground/70">
        <span className="mr-3">✅ Full automation</span>
        <span className="mr-3">⚡ Partial (AI drafts, you approve)</span>
        <span>★ AI-assisted</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-y bg-muted/30 text-[10px] text-muted-foreground">
              <th className="p-2 font-medium">Task Area / Deliverable</th>
              <th className="p-2 font-medium w-[70px]">Auto</th>
              <th className="p-2 font-medium w-[80px]">AI Tool</th>
              <th className="p-2 font-medium w-[70px]">Team</th>
              <th className="p-2 font-medium w-[50px] text-right">Hrs</th>
              <th className="p-2 font-medium w-[40px]">Week</th>
              <th className="p-2 font-medium w-[70px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className={`border-b hover:bg-muted/20 ${meta.rowBg}`}>
                <td className="p-2">
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      {post.platform}
                    </span>
                    <p className="mt-0.5 text-xs font-medium leading-snug">{post.topic_headline}</p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{post.caption}</p>
                    {post.hashtags && post.hashtags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Hash className="mr-0.5 h-2.5 w-2.5 text-muted-foreground/40" />
                        {post.hashtags.slice(0, 3).map((h, i) => (
                          <span key={i} className="text-[9px] text-muted-foreground/50">
                            #{h}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-2">
                  <AutomationBadge level={post.automation_level} />
                </td>
                <td className="p-2 text-[10px] text-muted-foreground">{post.automation_tool}</td>
                <td className="p-2">
                  <TeamBadge team={post.team} />
                </td>
                <td className="p-2 text-right text-[10px] text-muted-foreground">{post.est_hours?.toFixed(1)}</td>
                <td className="p-2 text-[10px]">W{post.week}</td>
                <td className="p-2">
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-[9px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    {post.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function CampaignSection({ data }: { data: ScheduleResponse }) {
  if (!data.campaigns || data.campaigns.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-primary" /> Paid Ad Campaigns
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="p-3 font-medium">Campaign</th>
                <th className="p-3 font-medium">Budget</th>
                <th className="p-3 font-medium">Objective</th>
                <th className="p-3 font-medium">Target Audience</th>
                <th className="p-3 font-medium">Creative Direction</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <p className="text-xs font-medium">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Weeks {c.run_weeks_start}–{c.run_weeks_end}
                    </p>
                  </td>
                  <td className="p-3">
                    <span className="font-medium">
                      S${c.budget_monthly}/mo
                    </span>
                    <p className="text-[10px] text-muted-foreground">{c.budget_currency}</p>
                  </td>
                  <td className="p-3 text-[10px]">{c.objective?.replace(/_/g, " ")}</td>
                  <td className="p-3 text-[10px] text-muted-foreground max-w-[200px] truncate">
                    {c.ad_copy_direction}
                  </td>
                  <td className="p-3 text-[10px] text-muted-foreground max-w-[200px] truncate">
                    {c.creative_brief}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function AudienceSection({ data }: { data: ScheduleResponse }) {
  if (!data.audiences || data.audiences.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" /> Audience Targeting
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="p-3 font-medium">Audience Type</th>
                <th className="p-3 font-medium">Segment</th>
                <th className="p-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.audiences.map((a: any) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <Badge variant="secondary" className="text-[9px] capitalize">
                      {a.tier}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs font-medium">{a.segment_name}</td>
                  <td className="p-3 text-[10px] text-muted-foreground">
                    {a.definition || a.setup_notes || ""}
                    {a.demographic && Object.keys(a.demographic).length > 0 && (
                      <span className="block mt-0.5">
                        Age {a.demographic.age_min}–{a.demographic.age_max}
                        {a.demographic.location ? ` · ${a.demographic.location}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ScheduleResults({ data }: Props) {
  const [activeTab, setActiveTab] = useState("overview")

  const phases = ["foundation", "growth", "acceleration"]
  const phasePosts = phases.map((ph) => ({
    phase: ph,
    posts: data.schedule.filter((p) => p.phase === ph),
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b pb-px">
        <button
          onClick={() => setActiveTab("overview")}
          className={`rounded-t-lg px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === "overview"
              ? "border-b-2 border-primary bg-muted/20 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 Overview
        </button>
        {phasePosts.map((pp) => {
          const meta = MONTH_META.find((m) => m.id === pp.phase)
          return (
            <button
              key={pp.phase}
              onClick={() => setActiveTab(pp.phase)}
              className={`rounded-t-lg px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === pp.phase
                  ? "border-b-2 border-primary bg-muted/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {meta?.label || pp.phase}
            </button>
          )
        })}
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && <OverviewSection data={data} />}

      {/* Month tabs */}
      {phasePosts.map((pp) =>
        activeTab === pp.phase ? (
          <div key={pp.phase} className="space-y-4">
            <MonthSection phase={pp.phase} posts={pp.posts} />
            <CampaignSection data={data} />
            <AudienceSection data={data} />
          </div>
        ) : null,
      )}

      {/* CTA */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-6 text-center">
        <h3 className="text-sm font-semibold">Want the full picture?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Get a complete PDF report with SEO/GEO/AEO scores, competitor intelligence, and AI engine visibility
          tracking.
        </p>
        <Link
          to="/report"
          className="group relative mx-auto mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#635bff] to-[#7c6fff] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#635bff]/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#635bff]/30"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download full report
          <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
            Pro
          </span>
        </Link>
      </div>
    </motion.div>
  )
}
