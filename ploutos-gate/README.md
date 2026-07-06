# Ploutos Gateway

FastAPI backend for website analysis and competitor research.

- **Website Analysis** — crawl a website + LLM extraction → structured company profile
- **Competitor Search** — multi-source aggregation (Tavily + DuckDuckGo) + LLM filtering → real competitors
- **Authentication** — Cognito-native passwordless OTP (email-based)

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- AWS credentials configured (`aws configure`) with Bedrock + Cognito permissions
- Tavily API key

## Quick Start

```bash
# Install dependencies
uv sync

# Set up environment
cp .env.example .env   # (create from template)
# Fill in your AWS keys, Tavily API key, Cognito pool IDs

# Create Cognito user pool (one-time)
uv run python setup-cognito.py
# Copy the printed IDs into .env

# Start server
./start.sh
# or: uv run uvicorn api:app --reload
```

Server runs at `http://localhost:8000`. OpenAPI docs at `http://localhost:8000/docs`.

## Authentication

Passwordless OTP via Cognito. All protected endpoints require the **id_token** as a Bearer token.

### Flow

| Step | Endpoint | Description |
|------|----------|-------------|
| 1 | `POST /auth/register` | Sign up with name + email |
| 2 | `POST /auth/verify` | Confirm with code from email |
| 3 | `POST /auth/login` | Request OTP for login |
| 4 | `POST /auth/login/verify` | Exchange OTP for tokens |
| 5 | `GET /auth/me` | Get user profile (requires id_token) |
| 6 | `POST /auth/refresh` | Refresh access token |

### cURL Example

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Your Name", "email": "you@example.com"}'

# Verify
curl -X POST http://localhost:8000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "code": "123456"}'

# Login OTP
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'

# Login verify (returns access_token, refresh_token, id_token)
curl -X POST http://localhost:8000/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "code": "654321"}'

# Get profile (use the id_token from step 4)
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <id_token>"
```

## API Endpoints

### Health

```
GET /health
```

### Auth (public)

| Method | Path | Body |
|--------|------|------|
| POST | `/auth/register` | `{ name, email }` |
| POST | `/auth/verify` | `{ email, code }` |
| POST | `/auth/login` | `{ email }` |
| POST | `/auth/login/verify` | `{ email, code }` → tokens |
| POST | `/auth/refresh` | `{ refresh_token }` |

### Protected (requires Bearer id_token)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/auth/me` | — | `{ sub, email, name }` |
| POST | `/analyze` | `{ url, max_terms? }` | `CompanyProfile` |
| POST | `/competitors` | `{ selections, sources?, max_results? }` | `CompetitorGroup[]` |

## Analyzing a Website

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <id_token>" \
  -d '{"url": "https://example.com", "max_terms": 5}'
```

Returns a `CompanyProfile` with company name, domain, industry, products, audience, categories, and search terms.

## Competitor Search

```bash
curl -X POST http://localhost:8000/competitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <id_token>" \
  -d '{
    "selections": [
      {
        "products": ["crm", "sales platform"],
        "audience": ["enterprise"]
      }
    ],
    "sources": ["tavily", "duckduckgo"],
    "max_results": 5
  }'
```

Returns grouped competitor lists per selection, deduplicated and filtered by Bedrock LLM.

## Project Structure

```
├── api.py                          # FastAPI app, routes, models
├── setup-cognito.py                # One-time Cognito pool setup
├── start.sh                        # Dev server launcher
├── website_analyzer/
│   ├── auth.py                     # Cognito auth operations
│   ├── deps.py                     # HTTPBearer dependency
│   ├── models.py                   # Pydantic models
│   ├── llm.py                      # ChatBedrock wrapper
│   ├── crawler.py                  # Crawl4AI (HTTP-only)
│   ├── search.py                   # LLM query gen + Tavily search
│   ├── analyzer.py                 # LLM extraction → CompanyProfile
│   ├── competitors.py              # Multi-source competitor search
│   └── search_sources/
│       ├── base.py                 # ABC for search plugins
│       ├── tavily_source.py        # Tavily implementation
│       └── duckduckgo_source.py    # DuckDuckGo implementation
├── .env                            # Credentials (gitignored)
├── .gitignore
├── pyproject.toml
└── AGENTS.md                       # AI assistant context
```

## Deployment

### Local dev

```bash
uv run uvicorn api:app --reload
# Server at http://localhost:8000, docs at http://localhost:8000/docs
```

Logs appear on stdout. The server reloads on code changes.

### Production (EC2 via systemd)

```bash
# One-time service setup
sudo cp ploutos-gate.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable ploutos-gate
sudo systemctl start ploutos-gate
```

`deploy.sh` copies the service file (if missing) and restarts:

```bash
bash deploy.sh
```

`start.sh` auto-detects CPU count for workers. No reload. Service auto-restarts on failure (5s delay).

### Logs (production)

```bash
journalctl -u ploutos-gate -f        # tail live logs
journalctl -u ploutos-gate --no-pager # full log dump
```

## Configuration (.env)

| Key | Required | Description |
|-----|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS secret key |
| `AWS_REGION` | Yes | AWS region (us-east-1) |
| `TAVILY_API_KEY` | Yes | Tavily search API key |
| `BEDROCK_MODEL` | No | Bedrock model ID (Claude Haiku) |
| `COGNITO_USER_POOL_ID` | Yes | Cognito user pool ID |
| `COGNITO_CLIENT_ID` | Yes | Cognito app client ID |
| `COGNITO_REGION` | Yes | Cognito region (us-east-1) |
