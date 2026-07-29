# APAC Intel — Premium Frontend

Complete React SaaS application integrating all 5 backend API endpoints.

## Quick Start

```bash
npm install

# Point at your FastAPI backend
echo "REACT_APP_API_URL=http://localhost:8000/api/v1" > .env

npm start
# → http://localhost:3000
```

Start the backend first:
```bash
cd ../apac_seo_api
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn main:app --reload --port 8000
```

## Demo Auth
The auth screens are wired up with mock API calls. Use OTP code **123456** to bypass verification and enter the dashboard.

## API → Screen Mapping

| Backend Endpoint | Screen |
|---|---|
| `POST /api/v1/seo/competitors` | Competitors page |
| `POST /api/v1/seo/keywords` | Keywords page |
| `POST /api/v1/seo/profile` | Company Profile page |
| `POST /api/v1/seo/domain-authority` | Domain Authority page |
| `POST /api/v1/seo/full-report` | Full Report page + Dashboard |

## Architecture

Single-file React app (`App.jsx`) — all components, context, hooks, and styles in one file for maximum portability. No external dependencies beyond React itself.

### Design System
| Token | Value |
|---|---|
| Background | `#07090F` |
| Surface | `#0C0F1A` |
| Primary | `#7C6FFF` |
| Accent | `#9D93FF` |
| Teal | `#2DD4BF` |
| Display | Plus Jakarta Sans / Syne 800 |
| Mono | JetBrains Mono |

### Features
- ✅ Auth flow: Signup → Email Verify → Login → OTP Login
- ✅ Split-screen auth with animated SVG globe
- ✅ 6-digit OTP with auto-focus, paste, countdown timer
- ✅ Glassmorphism auth card with gradient accent
- ✅ Full dashboard with sidebar navigation
- ✅ All 5 API endpoints integrated
- ✅ Result caching (full-report populates all pages)
- ✅ Loading skeletons on every section
- ✅ Toast notifications (success / error / info / warning)
- ✅ Keyword tabs (all / head / service / long-tail / top-5)
- ✅ DA trajectory gauge with visual bar
- ✅ Competitor score bars with strengths/weaknesses
- ✅ Copy buttons on all copyable text
- ✅ Character counters on profile descriptions
- ✅ Mobile responsive (hamburger sidebar)
- ✅ Reduced motion support
- ✅ ARIA labels and roles throughout
