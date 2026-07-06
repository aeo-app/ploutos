import { useState, useCallback, useRef, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ExternalLink,
  FileDown,
  Globe,
  Hash,
  Loader2,
  Package,
  Plus,
  Search,
  Tags,
  Target,
  Terminal,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useCompetitors } from "@/hooks/use-competitors"
import { useSchedule } from "@/hooks/use-schedule"
import ScheduleResults from "@/components/scheduler/ScheduleResults"
import type { AnalyzeResponse, CompetitorResult, CompetitorsResponse, ScheduleResponse } from "@/types/api"

const API_URL = import.meta.env.VITE_API_URL || "/api"

type FieldKey = "products" | "audience" | "categories" | "terms"

const FIELD_LABELS: Record<FieldKey, string> = {
  products: "Products & Services",
  audience: "Target Audience",
  categories: "Categories",
  terms: "Search Terms",
}

const FIELD_ICONS: Record<FieldKey, React.ElementType> = {
  products: Package,
  audience: Users,
  categories: Target,
  terms: Hash,
}

function CompetitorCard({ company }: { company: CompetitorResult }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="text-sm">{company.name}</CardTitle>
          <p className="text-xs text-muted-foreground">{company.domain}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {company.description || "No description available."}
        </p>
        {company.url && (
          <a
            href={company.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Visit website
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function CustomTagInput({ onAdd }: { onAdd: (term: string) => void }) {
  const [val, setVal] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const t = val.trim()
    if (t) {
      onAdd(t)
      setVal("")
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        placeholder="Type and press Enter…"
        className="h-7 w-44 text-xs"
      />
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function LogConsole({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  return (
    <div className="rounded-lg border bg-background font-mono text-xs leading-relaxed">
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" />
        Progress
      </div>
      <div className="h-48 space-y-1 overflow-y-auto p-3">
        {logs.map((msg, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/50">&gt;</span>
            <span>{msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [url, setUrl] = useState("")
  const [hasCachedAnalysis, setHasCachedAnalysis] = useState(false)
  const [maxTerms, setMaxTerms] = useState(10)
  const [maxResults, setMaxResults] = useState(10)
  const [profile, setProfile] = useState<AnalyzeResponse | null>(null)
  const [selected, setSelected] = useState<Record<FieldKey, Set<string>>>({
    products: new Set(),
    audience: new Set(),
    categories: new Set(),
    terms: new Set(),
  })
  const [competitorData, setCompetitorData] = useState<CompetitorsResponse | null>(null)
  const [customTerms, setCustomTerms] = useState<string[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(["linkedin", "instagram", "facebook"]))
  const [startDate, setStartDate] = useState("")
  const [hasCachedSchedule, setHasCachedSchedule] = useState(false)
  const [cachedScheduleData, setCachedScheduleData] = useState<ScheduleResponse | null>(null)

  const competitorMutation = useCompetitors()
  const scheduleMutation = useSchedule()

  useEffect(() => {
    const t = (() => {
      try { return JSON.parse(localStorage.getItem("ploutos-auth") || "{}") }
      catch { return {} }
    })()
    if (!t.id_token) return
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/analyze`, {
          headers: { Authorization: `Bearer ${t.id_token}` },
        })
        if (res.ok) {
          const body = await res.json()
          const analyses = body.analyses ?? []
          if (analyses.length > 0) {
            const latest = analyses[0]
            setUrl(latest.url)
            setProfile(latest.data)
            setHasCachedAnalysis(true)
          }
        }
      } catch {
        // not logged in or no cached data
      }
    })()
  }, [])

  useEffect(() => {
    const targetUrl = url.trim()
    if (!targetUrl) return
    setProfile(null)
    setHasCachedAnalysis(false)
    setCachedScheduleData(null)
    setHasCachedSchedule(false)
    const timer = setTimeout(async () => {
      const t = (() => {
        try { return JSON.parse(localStorage.getItem("ploutos-auth") || "{}") }
        catch { return {} }
      })()
      try {
        const res = await fetch(`${API_URL}/analyze/${encodeURIComponent(targetUrl)}`, {
          headers: { ...(t.id_token ? { Authorization: `Bearer ${t.id_token}` } : {}) },
        })
        if (res.ok) {
          const data = await res.json()
          setProfile(data.profile)
          setHasCachedAnalysis(true)
        }
      } catch {
        // no cached data
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [url])

  useEffect(() => {
    const targetUrl = profile?.domain_url
    if (!targetUrl || !hasCachedAnalysis) return
    setHasCachedSchedule(false)
    setCachedScheduleData(null)
    const t = (() => {
      try { return JSON.parse(localStorage.getItem("ploutos-auth") || "{}") }
      catch { return {} }
    })()
    const headers = { ...(t.id_token ? { Authorization: `Bearer ${t.id_token}` } : {}) }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/scheduler/${encodeURIComponent(targetUrl)}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setCachedScheduleData(data.schedule)
          setHasCachedSchedule(true)
          if (data.schedule.start_date) setStartDate(data.schedule.start_date)
          if (data.schedule.platforms?.length) setSelectedPlatforms(new Set(data.schedule.platforms))
        }
      } catch {
        // no cached schedule
      }
    })()
  }, [profile?.domain_url, hasCachedAnalysis])

  const toggleItem = useCallback((field: FieldKey, item: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[field])
      if (set.has(item)) set.delete(item)
      else set.add(item)
      next[field] = set
      return next
    })
    setCompetitorData(null)
  }, [])

  const clearSelections = useCallback(() => {
    setSelected({
      products: new Set(),
      audience: new Set(),
      categories: new Set(),
      terms: new Set(),
    })
    setCustomTerms([])
    setCompetitorData(null)
  }, [])

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetUrl = url.trim()
    if (!targetUrl) return

    setProfile(null)
    setCompetitorData(null)
    setCachedScheduleData(null)
    setHasCachedSchedule(false)
    setHasCachedAnalysis(false)
    clearSelections()
    setLogs([])
    setAnalyzeError(null)
    setIsAnalyzing(true)

    const tokens = (() => {
      try {
        return JSON.parse(localStorage.getItem("ploutos-auth") || "{}")
      } catch {
        return {}
      }
    })()

    try {
      const res = await fetch(`${API_URL}/analyze/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tokens.id_token ? { Authorization: `Bearer ${tokens.id_token}` } : {}),
        },
        body: JSON.stringify({ url: targetUrl, max_terms: Math.min(maxTerms, 20) }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setAnalyzeError(err.detail || "Analysis failed")
        setIsAnalyzing(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setAnalyzeError("Failed to read response stream")
        setIsAnalyzing(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let eventType = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim()
            continue
          }
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.message) {
                setLogs((prev) => [...prev, data.message])
              }
              if (data.profile) {
                setProfile(data.profile)
              }
              if (eventType === "error" && data.message) {
                setAnalyzeError(data.message)
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
      setHasCachedAnalysis(true)
    } catch (err: any) {
      setAnalyzeError(err.message || "Connection failed")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleFindCompetitors = () => {
    const allTerms = [...Array.from(selected.terms), ...customTerms]
    const selections = [
      {
        products:
          selected.products.size > 0 ? Array.from(selected.products) : undefined,
        audience:
          selected.audience.size > 0 ? Array.from(selected.audience) : undefined,
        categories:
          selected.categories.size > 0 ? Array.from(selected.categories) : undefined,
        terms:
          allTerms.length > 0 ? allTerms : undefined,
      },
    ]
    const allEmpty = !selections[0].products && !selections[0].audience && !selections[0].categories && !selections[0].terms
    if (allEmpty) return

    setCompetitorData(null)
    competitorMutation.mutate(
      { selections, max_results: Math.min(maxResults, 20) },
      { onSuccess: (data) => setCompetitorData(data) },
    )
  }

  const hasSelections =
    selected.products.size > 0 ||
    selected.audience.size > 0 ||
    selected.categories.size > 0 ||
    selected.terms.size > 0 ||
    customTerms.length > 0

  const selectedCount =
    selected.products.size +
    selected.audience.size +
    selected.categories.size +
    selected.terms.size +
    customTerms.length

  return (
    <div className="mx-auto max-w-4xl">
      {/* URL input */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Company Research</h1>
          <p className="mt-1 text-muted-foreground">
            Enter a company URL to get started.
          </p>
        </div>
      </motion.div>

      <motion.form
        onSubmit={handleAnalyze}
        className="mt-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analyze a website</CardTitle>
            <CardDescription>
              We'll scan the website and related pages to build a complete picture.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://example.com"
                  className="pl-9"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={maxTerms}
                  onChange={(e) => setMaxTerms(Number(e.target.value))}
                  title="Search terms"
                />
              </div>
              <Button type="submit" disabled={isAnalyzing || !url.trim()}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    {hasCachedAnalysis ? "Reanalyze" : "Analyze"}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            {analyzeError && (
              <p className="mt-3 text-sm text-destructive">{analyzeError}</p>
            )}
          </CardContent>
        </Card>
      </motion.form>

      {/* Live log console */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <LogConsole logs={logs} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile results with clickable badges */}
      <AnimatePresence>
        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Company Profile</CardTitle>
                    <CardDescription>
                      Click any item to include it in your competitor search.
                    </CardDescription>
                  </div>
                  {hasSelections && (
                    <Button variant="ghost" size="sm" onClick={clearSelections}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {/* Static fields */}
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      Company Name
                    </div>
                    <p className="text-sm font-medium">{profile.company_name}</p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      Domain
                    </div>
                    <p className="text-sm font-medium">{profile.domain_url}</p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Tags className="h-3.5 w-3.5" />
                      Industry
                    </div>
                    <p className="text-sm font-medium">{profile.business_domain}</p>
                  </div>

                  {/* Clickable fields */}
                  {(["products", "audience", "categories", "terms"] as FieldKey[]).map(
                    (field) => {
                      const Icon = FIELD_ICONS[field]
                      const items = profile[field]
                      const selectedSet = selected[field]

                      return (
                        <div key={field}>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                            {FIELD_LABELS[field]}
                            {selectedSet.size > 0 && (
                              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                {selectedSet.size}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.length > 0 ? (
                              items.map((item) => {
                                const active = selectedSet.has(item)
                                return (
                                  <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleItem(field, item)}
                                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                                      active
                                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                        : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                    }`}
                                  >
                                    {item}
                                  </button>
                                )
                              })
                            ) : (
                              <span className="text-sm italic text-muted-foreground/60">
                                None detected
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    },
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selections summary + Find Competitors */}
      <AnimatePresence>
        {hasSelections && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Searching for competitors in:</span>
                  {(Object.keys(selected) as FieldKey[]).map((field) =>
                    Array.from(selected[field]).map((item) => (
                      <Badge
                        key={`${field}-${item}`}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => toggleItem(field, item)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )),
                  )}
                  {customTerms.map((term) => (
                    <Badge key={term} variant="secondary" className="gap-1 pr-1">
                      {term}
                      <button
                        type="button"
                        onClick={() => setCustomTerms(customTerms.filter((t) => t !== term))}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground shrink-0">Custom terms:</span>
                  <CustomTagInput onAdd={(t) => setCustomTerms([...customTerms, t])} />
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-16">
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={maxResults}
                        onChange={(e) => setMaxResults(Number(e.target.value))}
                        title="Max results"
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={clearSelections}
                    >
                      Clear all
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleFindCompetitors}
                      disabled={competitorMutation.isPending}
                    >
                      {competitorMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          Searching…
                        </>
                      ) : (
                        <>
                          <Search className="mr-1 h-4 w-4" />
                          Find competitors ({selectedCount})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {competitorMutation.isError && (
                  <p className="mt-3 text-sm text-destructive">
                    {(competitorMutation.error as any)?.response?.data?.detail ||
                      "Competitor search failed. Please try again."}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Competitor loading skeletons */}
      <AnimatePresence>
        {competitorMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-1 h-3 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="mt-1 h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Competitor results */}
      <AnimatePresence>
        {competitorData && !competitorMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <Separator className="mb-6" />
            <h2 className="mb-4 text-lg font-semibold">Competitors/Top Search Results</h2>
            {competitorData.results.length > 0 &&
            competitorData.results[0].companies.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {competitorData.results[0].companies.map((c) => (
                  <CompetitorCard key={c.domain} company={c} />
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground/60">
                No competitors found for the selected criteria. Try selecting different terms.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule generation */}
      <AnimatePresence>
        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">90-Day Content Schedule</h3>
                  <p className="text-xs text-muted-foreground">
                    Select platforms and start date, then generate.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {["linkedin", "instagram", "facebook", "tiktok", "youtube", "twitter_x", "pinterest"].map((p) => {
                    const active = selectedPlatforms.has(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setSelectedPlatforms((prev) => {
                            const next = new Set(prev)
                            if (next.has(p)) next.delete(p)
                            else next.add(p)
                            return next
                          })
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all capitalize ${
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {p.replace("_", "/")}
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Start date:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCachedScheduleData(null)
                      setHasCachedSchedule(false)
                      scheduleMutation.mutate(
                        {
                          company_profile: {
                            company_name: profile.company_name,
                            domain_url: profile.domain_url,
                            business_domain: profile.business_domain,
                            products: profile.products,
                            audience: profile.audience,
                            categories: profile.categories,
                            terms: profile.terms,
                          },
                          platforms: Array.from(selectedPlatforms),
                          duration_days: 90,
                          start_date: startDate,
                        },
                        {
                          onSuccess: (data) => {
                            setCachedScheduleData(data)
                            setHasCachedSchedule(true)
                          },
                        },
                      )
                    }}
                    disabled={scheduleMutation.isPending || selectedPlatforms.size === 0 || !startDate}
                  >
                    {scheduleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <CalendarClock className="mr-1 h-4 w-4" />
                        {hasCachedSchedule ? "Regenerate Schedule" : "Generate Schedule"}
                      </>
                    )}
                  </Button>
                </div>

                {scheduleMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(scheduleMutation.error as any)?.response?.data?.detail ||
                      "Schedule generation failed. Please try again."}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule results */}
      <AnimatePresence>
        {(scheduleMutation.data || cachedScheduleData) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="mt-6"
          >
            <ScheduleResults data={scheduleMutation.data || cachedScheduleData!} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full report CTA */}
      {!scheduleMutation.data && !cachedScheduleData && (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-10"
      >
        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-6 text-center sm:p-8">
          <h3 className="text-lg font-semibold">Want the full picture?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a complete 15-page PDF report with SEO/GEO/AEO scores, competitor intelligence, and AI engine visibility tracking.
          </p>
          <Link
            to="/report"
            className="group relative mx-auto mt-4 inline-flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-[#635bff] to-[#7c6fff] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#635bff]/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#635bff]/30"
          >
            <span className="absolute inset-0 -translate-x-full skew-x-6 bg-white/10 transition-transform duration-300 group-hover:translate-x-full" />
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/20">
              <FileDown className="h-3.5 w-3.5" />
            </span>
            <span>Download full report</span>
            <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
              Pro
            </span>
          </Link>
        </div>
      </motion.div>
      )}
    </div>
  )
}
