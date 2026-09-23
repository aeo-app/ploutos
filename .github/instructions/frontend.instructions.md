---
applyTo: "frontend/**"
---

# Frontend Instructions

- Work from the monorepo root, but run frontend commands from `frontend/`.
- The active CRA application is `frontend/src/`. The root `frontend/App.jsx` and `frontend/index.js` are legacy reference files and should not be changed for normal feature work.
- Keep API adapters in `src/api/`, shared authentication/application/payment state in `src/context/`, reusable UI and layout in `src/components/`, and route-level screens in `src/pages/`.
- Preserve the existing token-expiry handling around authenticated requests. Keep API contract changes synchronized with the corresponding FastAPI router and Pydantic model under `../backend/`.
- POST-based SSE flows are manually streamed and parsed because native `EventSource` cannot send POST bodies or authorization headers. Preserve that behavior unless the transport contract changes deliberately.
- Payments are contextual rather than a blanket frontend gate: locked preview items open checkout through the existing payment context and Airwallex flow.
- Treat CRA environment variables as build-time configuration. Use `frontend/.env.example` for local setup and never commit real credentials or `.env` files.
- Follow the existing component and CSS conventions, including responsive layouts, accessibility attributes, reduced-motion support, and shared design tokens. Avoid introducing a second state or styling system for a local feature.
- Run `npm install` when dependencies change and validate frontend changes with `npm run build` from `frontend/`. There is no standalone frontend test or lint script configured.

See [frontend README](../../frontend/README.md) for setup and the active application notes.