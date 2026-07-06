# `ploutos-gate/website_analyzer/` — Module Reference

**14 Python files, ~860 lines.** The core backend logic for the Ploutos Gateway API. Implements a pipeline for analyzing company websites: crawl → LLM extraction → competitor search → competitor filtering. Also ships authentication (Cognito), contact (SES), and FastAPI glue.

```
ploutos-gate/website_analyzer/
├── __init__.py
├── MODULE.md                          # this file
├── models.py                          # Pydantic schemas for all data
├── crawler.py                         # HTTP-only website crawl via crawl4ai
├── llm.py                             # AWS Bedrock client (Claude Haiku) with STS assume-role
├── analyzer.py                        # LLM-structured extraction → CompanyProfile
├── search.py                          # LLM query generation + Tavily search + formatting
├── competitors.py                     # Multi-source competitor search + dedup + LLM filter
├── auth.py                            # Cognito: register, OTP, JWKS verify, refresh
├── contact.py                         # AWS SES contact form email
├── deps.py                            # FastAPI Depends (HTTPBearer → verify_token)
└── search_sources/
    ├── __init__.py                    # Plugin registry
    ├── base.py                        # SearchSource ABC
    ├── tavily_source.py               # Tavily (API key)
    └── duckduckgo_source.py           # DuckDuckGo (no key)
```

---

## 1. Data Models (`models.py`)

All Pydantic models, shared across every module in the package.

| Model | Purpose |
|---|---|
| `CompanyProfile` | Output of the main analysis — name, domain, industry, products, audience, categories, terms |
| `SearchQuery` | A single search query + justification reason |
| `SearchQueryList` | Batch wrapper for `SearchQuery` |
| `CompetitorSelection` | Input filter — audience/products/categories/terms (at least one required via `model_validator`) |
| `CompetitorResult` | A single competitor hit — name, domain, url, description, source |
| `CompetitorGroup` | One selection → its filtered results |
| `FilteredCompanyList` | LLM filter output wrapper |

---

## 2. Crawler (`crawler.py`)

HTTP-only crawler using `crawl4ai`'s `AsyncHTTPCrawlerStrategy` (no Playwright — Ubuntu 26.04 unsupported).

### Pipeline per URL

1. Crawl the landing page via `AsyncWebCrawler.arun()`
2. Extract markdown from the result (`fit_markdown` → `raw_markdown`)
3. Discover internal links from `result.links["internal"]`, or fall back to common paths (`/about`, `/products`, `/services`, `/company`, `/team`)
4. Crawl up to `max_pages - 1` additional internal pages concurrently via `asyncio.gather()`
5. Concatenate all pages as markdown with `# Page: {url}` headers

### Helpers

- `_normalize_url(base_url, link)` → filters javascript: and fragment links, normalizes relative URLs via `urljoin`, rejects non-http(s) schemes
- `BROWSER_HEADERS` — full Chrome 125 user-agent + security headers to avoid bot detection

---

## 3. LLM (`llm.py`)

Singleton-patterned AWS Bedrock client factory.

### STS Assume Role

If `BEDROCK_ASSUME_ROLE_ARN` is set:
- Calls `sts.assume_role()` for cross-account access
- Creates a fresh `bedrock-runtime` client with temporary credentials
- Refreshes every ~55 minutes (5-minute buffer before STS expiry)

### Fallback

If no role ARN, uses default credentials (instance profile / env vars).

### Client

- `boto3.client("bedrock-runtime")` → wrapped by `langchain_aws.ChatBedrock`
- **Model**: `BEDROCK_MODEL` env var, defaults to `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- **Temperature**: 0 (deterministic extraction)
- **`max_tokens`**: None (no cap)

### Caching

`_bedrock_client` is cached globally with an expiry timestamp. `build_llm()` calls `_get_bedrock_client()` each time, but the expensive STS refresh only runs when the cached creds are near expiry.

---

## 4. Analyzer (`analyzer.py`)

Structured extraction via LangChain's `with_structured_output` pattern:

```
ChatPromptTemplate [system + human]
  → ChatBedrock.with_structured_output(CompanyProfile)
  → CompanyProfile instance
```

### Prompts

- **System**: Business intelligence analyst persona, defines 7 extraction fields with descriptions
- **Human**: Injects `{crawl_content}` and `{search_context}`, asks for structured output from both sources

### The 7 Extracted Fields

| Field | Type | Description |
|---|---|---|
| `company_name` | string | Official company name |
| `domain_url` | string | Domain URL of website |
| `business_domain` | string | Primary industry (e.g. "SaaS", "fintech") |
| `products` | list[str] | Products or services offered |
| `audience` | list[str] | Target customer segments |
| `categories` | list[str] | Business categories (e.g. "cloud computing") |
| `terms` | list[str] | Important keywords/jargon for understanding the business |

### `analyze_company()` async function

Central orchestrator: given URL, crawled markdown, and search context, produces the final `CompanyProfile`.

---

## 5. Search (`search.py`)

Two-phase search: LLM query generation → Tavily execution.

### Phase 1 — Query Generation

- Uses `ChatBedrock` with `with_structured_output(SearchQueryList)` to generate `max_terms` targeted search queries from crawled content
- Queries cover name variants, products, tech stack, industry categories, competitors, news
- Each query includes a `reason` field explaining relevance
- Content is truncated to 15,000 chars before being sent to the LLM

### Phase 2 — Execution & Formatting

- `execute_search()` calls Tavily API synchronously via `TavilyClient.search()`
- Returns empty list if `TAVILY_API_KEY` is unset or on exception

### `format_search_context()`

- Runs all generated queries through Tavily (max 3 results each)
- Collects result snippets
- Concatenates into a formatted string with blocks:

```
Query: ...
Reason: ...
Results:
- snippet 1
- snippet 2
```

---

## 6. Competitors (`competitors.py`)

Multi-source competitor search with post-processing.

### Query Building (`_build_queries`)

Combines `products + categories + terms + audience` from a `CompetitorSelection` into two query variants:
- `"{terms} companies"`
- `"top {terms} providers"`

Returns empty if the selection yields no base string.

### Multi-Source Search

Iterates all requested sources (default: Tavily + DuckDuckGo), running each query through each source. Results parsed into `CompetitorResult` objects.

### Deduplication (`_deduplicate`)

- Filters by domain (case-insensitive), using a `seen` set
- Strips entries matching `BLOCKED_DOMAINS`:

```
reddit.com, facebook.com, twitter.com, x.com, instagram.com,
linkedin.com, youtube.com, tiktok.com, wikipedia.org, quora.com,
pinterest.com, tumblr.com, medium.com, news.ycombinator.com,
stackoverflow.com, github.com
```

### LLM Filter (`_filter_with_llm`)

- Constructs a raw text block from all deduped results
- Sends to Bedrock with `FILTER_SYSTEM_PROMPT` which:
  - **KEEPS**: company official websites, service pages, business listings for specific companies
  - **REMOVES**: social media, Wikipedia, video platforms, job boards, government sites, generic blog articles, listicles, review sites
- Derives clean company names and descriptions
- Falls back to unfiltered results if Bedrock unavailable or errors

### `search_competitors()` async function

Returns `list[CompetitorGroup]` — one group per input `CompetitorSelection`, each with up to `max_results` filtered companies.

---

## 7. Search Sources Plugin System (`search_sources/`)

### `base.py`

Abstract base class `SearchSource`:
- `.name` property (str)
- `.search(query, max_results)` → `list[CompetitorResult]`

### `__init__.py`

Registry pattern:
- `_REGISTRY: dict[str, type[SearchSource]]` — maps name → class
- `get_source(name)` → instantiated source
- `register_source(name, cls)` → add to registry
- `list_sources()` → available source names

Built-in sources: `"tavily"` and `"duckduckgo"`. The plugin system allows adding new search backends without modifying existing code.

### `tavily_source.py`

- Uses `TavilyClient` (requires `TAVILY_API_KEY`)
- Extracts domain from URL via `urlparse`
- Truncates description to 300 chars
- Error-safe: returns `[]` on any exception

### `duckduckgo_source.py`

- Uses `ddgs` library (no API key needed)
- Same interface and field extraction as Tavily
- Error-safe: returns `[]` on any exception

Both sources extract:
- `title → name`
- `urlparse → domain`
- URL directly
- `content[:300]` or `body[:300]` → description
- Tag with `source=self.name`

---

## 8. Auth (`auth.py`)

~230 lines. Full Cognito auth layer.

### Operations

| Operation | Cognito Flow | Endpoint |
|---|---|---|
| `register_user()` | `sign_up` → generates password, stores in memory | `POST /auth/register` |
| `verify_user()` | `confirm_sign_up` → `initiate_auth` (USER_PASSWORD_AUTH) → returns tokens | `POST /auth/verify` |
| `request_otp()` | `forgot_password` (triggers email) | `POST /auth/login` |
| `verify_otp()` | `confirm_forgot_password` with new password → `initiate_auth` → tokens | `POST /auth/login/verify` |
| `verify_token()` | JWKS fetch + RSA256 verification (audience + issuer check) | used by `GET /auth/me` |
| `refresh_access_token()` | `REFRESH_TOKEN_AUTH` flow | `POST /auth/refresh` |

### Key Implementation Details

- **Passwordless OTP**: Uses Cognito's ForgotPassword flow as a workaround — no custom Lambda triggers needed
- **Password generation**: 12 characters minimum (lowercase + uppercase + digit + remaining random)
- **JWKS caching**: Stored in `_jwks_cache` dict; double-fetch on cache miss (fallback if key rotated)
- **Token verification**: `python-jose[cryptography]` with RSA256; validates `aud` (client_id) and `iss` (pool URL)
- **`/auth/me` requires id_token** (not access_token) as Bearer — the id token carries user claims
- **`_pending_passwords`**: In-memory dict, survives until `verify_user()` succeeds. Not suitable for multi-process deployments.

### Error Handling

- `UsernameExistsException` → 400 "already exists"
- `CodeMismatchException` → 400 "invalid code"
- `ExpiredCodeException` → 400 "code expired"
- `UserNotFoundException` → 400 (on OTP request)
- All others → 500

---

## 9. Contact (`contact.py`)

Simple AWS SES v2 wrapper.

### Configuration

| Env Var | Default | Purpose |
|---|---|---|
| `CONTACT_SENDER` | `noreply@aeo-app.ai` | From email address |
| `CONTACT_EMAIL` | `sales@aeo-app.ai` | To / recipient |
| `CONTACT_REGION` | `us-east-1` | AWS region for SES |

### Behavior

- Formats a plain text email with name, email, plan, and message body
- Subject: `"New contact from {name} — {plan or 'No plan selected'}"`
- Logs MessageId on success
- Raises `RuntimeError` on failure

---

## 10. FastAPI Dependency (`deps.py`)

Minimal glue:

```
HTTPAuthorizationCredentials (Bearer token)
  → verify_token(token) [from auth.py]
  → dict (Cognito JWT payload with sub, email, etc.)
```

Raises `401` on invalid/expired/missing tokens.

---

## 11. Integration Points

### `api.py` (fastapi app entry point)

All 15 imports from `website_analyzer` map to endpoints:

| Endpoint | Module | Key Functions |
|---|---|---|
| `POST /analyze` | crawler, search, analyzer | `crawl → generate queries → search → analyze` (synchronous chain) |
| `POST /analyze/stream` | same | Same chain, SSE-streamed via `_stream_analyze()` |
| `POST /competitors` | competitors | `search_competitors(selections, sources)` |
| `POST /contact` | contact | `send_contact_email(name, email, message, plan)` |
| `POST /auth/register` | auth | `register_user()` |
| `POST /auth/verify` | auth | `verify_user()` |
| `POST /auth/login` | auth | `request_otp()` |
| `POST /auth/login/verify` | auth | `verify_otp()` |
| `POST /auth/refresh` | auth | `refresh_access_token()` |
| `GET /auth/me` | deps | `require_auth` → returns `{email, sub, ...}` |

### `scheduler/generator.py`

Uses `build_llm()` from `llm.py` for Facebook content schedule generation (separate concern, shares Bedrock client via the singleton).

---

## 12. Data Flow Diagram

```
User URL
  │
  ▼
crawler.py ──HTTP crawl──► markdown (max 5 pages)
  │
  ├────────────────────────────────────┐
  ▼                                    ▼
search.py (LLM query gen)        analyzer.py (LLM extraction)
  │                                    │
  ▼                                    ▼
Tavily API ──► search context    CompanyProfile (Pydantic)
  │
  ▼
competitors.py
  │  ┌─► DuckDuckGo (no key)
  ├──┼─► Tavily (API key)
  │  └─► dedup (domain) → LLM filter → CompetitorGroup[]
  ▼
JSON response (not persisted)
```

---

## 13. Configuration Surface

All tunables via environment variables (env or `.env`):

| Variable | Default | Used In |
|---|---|---|
| `TAVILY_API_KEY` | (required) | `search.py`, `tavily_source.py` |
| `BEDROCK_MODEL` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | `llm.py` |
| `BEDROCK_ASSUME_ROLE_ARN` | (optional) | `llm.py` |
| `AWS_REGION` | `us-east-1` | `llm.py`, `auth.py` |
| `COGNITO_USER_POOL_ID` | (required) | `auth.py` |
| `COGNITO_CLIENT_ID` | (required) | `auth.py` |
| `COGNITO_REGION` | `us-east-1` | `auth.py` |
| `CONTACT_EMAIL` | `sales@aeo-app.ai` | `contact.py` |
| `CONTACT_SENDER` | `noreply@aeo-app.ai` | `contact.py` |
| `CONTACT_REGION` | `us-east-1` | `contact.py` |

No secrets logged or leaked. Boto3 picks up `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` from env/credentials automatically.

---

## 14. Test Coverage (6 files in `tests/`)

| Test File | What It Tests |
|---|---|
| `test_models.py` | Pydantic model construction + validation (`CompetitorSelection` at-least-one rule) |
| `test_crawler.py` | `_normalize_url` edge cases (javascript:, fragments, relative URLs, invalid schemes) |
| `test_auth.py` | Password generation, registration flow with mocked Cognito |
| `test_competitors.py` | `BLOCKED_DOMAINS` set, deduplication logic, query building from `CompetitorSelection` |
| `test_search_sources.py` | Source registry, Tavily/DuckDuckGo domain extraction, ABC instantiation guard |
| `test_api.py` | API endpoint routing + dependencies (mocks all external services via `conftest.py`) |

All tests are offline-capable using `unittest.mock` to patch Cognito, Bedrock, Tavily, and SES. Conftest sets up `TestClient` with `load_dotenv()`.
