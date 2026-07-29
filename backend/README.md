# APAC SEO Intelligence API

AI-powered SEO competitive intelligence API built with **FastAPI** and **Claude AI**.

---

## Project Structure

```
apac_seo_api/
├── main.py                    # FastAPI app entry point
├── requirements.txt
├── models/
│   └── seo_models.py          # All Pydantic data models
├── services/
│   └── claude_service.py      # Claude AI service layer
└── routers/
    └── seo_router.py          # API route definitions
```

---

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your Anthropic API key
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Start the server
```bash
cd apac_seo_api
uvicorn main:app --reload --port 8000
```

### 4. Open API docs
```
http://localhost:8000/docs
```

---

## API Endpoints

All endpoints accept a **POST** request with this JSON body:

```json
{
  "company_name": "APAC Relocation",
  "url": "https://www.apacrelocation.com",
  "market": "Singapore",
  "industry": "International Relocation / Moving Services"
}
```

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/seo/competitors` | Competitor overview, SEO visibility, keyword rankings, scores |
| `POST /api/v1/seo/keywords` | Top search queries ranked by volume with APAC position |
| `POST /api/v1/seo/profile` | LinkedIn + Google Business Profile descriptions |
| `POST /api/v1/seo/domain-authority` | DA strategy, backlink opportunities, priority actions |
| `POST /api/v1/seo/full-report` | All four analyses in a single call |

---

## Example: cURL request

```bash
curl -X POST http://localhost:8000/api/v1/seo/competitors \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "APAC Relocation",
    "url": "https://www.apacrelocation.com",
    "market": "Singapore",
    "industry": "International Relocation / Moving Services"
  }'
```

---

## Example: Python requests

```python
import requests

payload = {
    "company_name": "APAC Relocation",
    "url": "https://www.apacrelocation.com",
    "market": "Singapore",
    "industry": "International Relocation / Moving Services"
}

# Individual endpoint
r = requests.post("http://localhost:8000/api/v1/seo/competitors", json=payload)
print(r.json())

# Full report (all 4 analyses)
r = requests.post("http://localhost:8000/api/v1/seo/full-report", json=payload)
print(r.json())
```

---

## Response Models

### `/competitors`
```json
{
  "company": "APAC Relocation",
  "url": "https://www.apacrelocation.com",
  "competitor_overview": [...],
  "seo_visibility": [...],
  "keyword_rankings": [...],
  "competitor_scores": [...],
  "key_takeaways": [...]
}
```

### `/keywords`
```json
{
  "company": "APAC Relocation",
  "market": "Singapore",
  "high_volume_head_terms": [...],
  "mid_volume_service_terms": [...],
  "long_tail_high_intent": [...],
  "strategic_priority_summary": [...]
}
```

### `/profile`
```json
{
  "company_name": "APAC Relocation",
  "url": "...",
  "tagline": "...",
  "linkedin_overview": "...",
  "google_business_description": "...",
  "linkedin_specialties": [...],
  "google_business_categories": [...]
}
```

### `/domain-authority`
```json
{
  "company": "APAC Relocation",
  "current_da": 32,
  "target_da_6m": 42,
  "target_da_12m": 52,
  "gap_analysis": [...],
  "backlink_opportunities": [...],
  "top_5_priority_actions": [...]
}
```

---

## Notes

- The `/full-report` endpoint makes 4 sequential Claude API calls and may take 30–60 seconds.
- All data is generated dynamically by Claude — outputs are tailored to the company, market, and industry you provide.
- Works for any company and market, not just APAC Relocation / Singapore.
