export interface ErrorResponse {
  detail: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface RegisterResponse {
  message: string
  email: string
}

export interface VerifyRequest {
  email: string
  code: string
}

export interface VerifyResponse {
  message: string
  email: string
}

export interface OtpRequest {
  email: string
}

export interface OtpVerifyRequest {
  email: string
  code: string
}

export interface PasswordLoginRequest {
  email: string
  password: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  email: string
  code: string
  new_password: string
}

export interface MessageResponse {
  message: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string | null
  id_token: string | null
  expires_in: number
  token_type: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface UserResponse {
  sub: string
  email: string
  name: string
}

export interface AnalyzeRequest {
  url: string
  max_terms?: number
}

export interface AnalyzeResponse {
  company_name: string
  domain_url: string
  business_domain: string
  products: string[]
  audience: string[]
  categories: string[]
  terms: string[]
}

export interface CompetitorSelection {
  audience?: string[]
  products?: string[]
  categories?: string[]
  terms?: string[]
}

export interface CompetitorRequest {
  selections: CompetitorSelection[]
  sources?: string[]
  max_results?: number
}

export interface CompetitorResult {
  name: string
  domain: string
  url: string
  description: string
  source: string
}

export interface CompetitorGroup {
  selection: CompetitorSelection
  companies: CompetitorResult[]
}

export interface CompetitorsResponse {
  results: CompetitorGroup[]
}

export interface ScheduleRequest {
  company_profile: {
    company_name: string
    domain_url: string
    business_domain: string
    products: string[]
    audience: string[]
    categories: string[]
    terms: string[]
  }
  platforms?: string[]
  duration_days?: 30 | 60 | 90
  start_date?: string
  currency?: string
  tone_override?: string
}

export interface SchedulePost {
  id: string
  week: number
  month: number
  phase: "foundation" | "growth" | "acceleration"
  day: string
  date: string
  platform: string
  post_type: string
  content_pillar: string
  topic_headline: string
  caption: string
  visual_description: string
  hashtags: string[]
  target_audience: string
  automation_tool: string
  is_paid: boolean
  budget_type: string
  goal: string
  cta: string
  automation_level: string
  team: string
  est_hours: number
  status: string
  notes: string
}

export interface ScheduleResponse {
  company_name: string
  domain_url: string
  duration_days: number
  start_date: string
  end_date: string
  platforms: string[]
  strategy: Record<string, any>
  schedule: SchedulePost[]
  campaigns: any[]
  audiences: any[]
  caption_templates: any[]
}
