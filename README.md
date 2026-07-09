# AXiM Support System

AXiM is a React frontend + Cloudflare Worker backend support platform.

## Architecture

- **Frontend:** React/Vite (`/src`) deployed to **Cloudflare Pages**
- **Backend API:** Worker (`/onyx-edge-worker`) deployed with **Wrangler**
- **Data/Realtime:** Supabase
- **AI + Triage Pipeline:** Worker endpoints under `/api/v1/*`

## Local setup

1. Install dependencies:
   - `npm ci`
   - `npm --prefix onyx-edge-worker ci`
2. Copy env template and set values:
   - `.env.example` -> `.env`
   - `onyx-edge-worker/.dev.vars` for Worker local secrets
3. Start apps:
   - Frontend: `npm run dev`
   - Worker: `npm run dev:worker`

Frontend expects the Worker at `VITE_EDGE_WORKER_URL` (default `http://localhost:8787`).

## Cloudflare Worker deployment

From `onyx-edge-worker/`:

1. Authenticate:
   - `npx wrangler login`
2. Create/bind KV namespaces used by `wrangler.toml`:
   - `KB_CACHE`
   - `IDEMPOTENCY_KV`
   - `STATUS_KV`
3. Set required secrets:
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
   - `npx wrangler secret put AXIM_ONYX_SECRET`
   - `npx wrangler secret put ANTHROPIC_API_KEY`
   - `npx wrangler secret put AXIM_SERVICE_KEY`
   - `npx wrangler secret put TURNSTILE_SECRET_KEY`
4. Validate deployment package:
   - `npx wrangler deploy --dry-run`
5. Deploy:
   - `npx wrangler deploy`

## Cloudflare Pages deployment

1. Build command: `npm run build`
2. Output directory: `dist`
3. Required Pages env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_EDGE_WORKER_URL`
   - `VITE_TURNSTILE_SITE_KEY`
   - `VITE_MOCK_LLM_ENABLED=false`

## Helpful scripts

- `npm run dev` - frontend dev server
- `npm run dev:worker` - worker dev server
- `npm run build` - frontend production build
- `npm run build:worker` - worker bundle build
- `npm run test:worker` - worker tests
- `npm run deploy:worker` - worker deploy via Wrangler
