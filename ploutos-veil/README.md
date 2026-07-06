# Ploutos-Veil

Frontend for [ploutos-gate](https://github.com/anomalyco/ploutos-gate). Website analysis dashboard with competitor search.

**Stack**: React 19, TypeScript 6, Vite 8, Tailwind CSS 4, shadcn/ui, TanStack Query, React Router v7, Framer Motion, Axios.

## Quick start

```bash
npm install
npm run dev      # dev server on :5173
```

The dev server proxies `/api` → `http://localhost:8000` (set in `vite.config.ts`), so you don't need a separate API URL in `.env` for local work.

## Configuration

Create `.env` (see `.env.example`):

```env
VITE_API_URL=/api          # Dev default (Vite proxy). Set to backend URL for production.
```

Or use `.env.production` for production builds:

```env
VITE_API_URL=https://api.aeo-app.ai
```

## Commands

```bash
npm run dev      # dev server with HMR on :5173
npm run build    # tsc -b && vite build → dist/
npm run lint     # eslint
npm run preview  # preview production build locally
```

## Deployment

### Production (S3 static hosting)

```bash
bash deploy.sh
```

This builds with the production API URL and syncs `dist/` to `s3://www.aeo-app.ai`.

### Local

Logs appear on stdout (Vite dev server output). No special logging setup needed.

### Production logs

- Build output: checked during deploy (stdout from `deploy.sh`)
- Runtime: S3 access logs (configured on the bucket, not streamed)
- For live debugging, build locally with `VITE_API_URL=<url> npm run build` and serve via `npm run preview`
