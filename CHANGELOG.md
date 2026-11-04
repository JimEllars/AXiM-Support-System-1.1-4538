# Changelog

## 2026-11-04 — Phase 161: build integrity, read-surface budgets, honest robotics HUD

Full evidence, line ranges and before/after logs: `AGENTS_VERIFICATION.d/2026-11-04-phase-161.md`.

### Build integrity

- **Tailwind never ran in production builds.** `vite.config.js` set
  `css: { postcss: { plugins: [] } }`, which replaces Vite's `postcss.config.js` lookup and
  therefore skipped `tailwindcss` and `autoprefixer` entirely. Every build emitted
  `@tailwind base; @tailwind components; @tailwind utilities;` verbatim — 0.78 kB of CSS with
  `@apply` unexpanded, so the deployed app was unstyled. The vendor stylesheet in defect 2
  made the CSS byte count look plausible and hid it. Now 82.70 kB of real utilities.
- **A 2.03 MB unused stylesheet was in every visitor's critical path.**
  `src/App.jsx` imported `@questlabs/react-sdk/dist/style.css` while nothing in `src/` renders
  a Quest/HelpHub component. 1.56 MB of it is one base64 PNG for `.question-input-cont`.
  Removed: CSS 2,032.41 kB → 82.70 kB (gzip 1,366.08 → 12.83 kB).
- **Frontend test gate was red on a 2 vCPU runner.** vitest hard-codes a 60s worker-start
  timeout; four forks booting `react-dom` + `happy-dom` at once exceeded it
  (`Timeout waiting for worker to respond`). Fixed by shrinking each fork's module graph
  (defect 4) and pinning `maxWorkers: 2`.
- **`import * as FiIcons from 'react-icons/fi'` defeated tree-shaking in seven components.**
  `SafeIcon` resolved icons through a computed key, so the whole Feather set shipped.
  It now uses an explicit six-entry registry and every consumer imports icons by name.
- **Three components built worker URLs from a literal `${workerUrl}` string**
  (`TicketList.jsx`, `Customer360.jsx`, `RCADocumentBlock.jsx`). With
  `VITE_EDGE_WORKER_URL` unset they requested `${workerUrl}/api/v1/...`. All three now use the
  shared `getEdgeWorkerUrl()` helper.

### Security

- **Rate-limit counters were shared across routes.** `checkRateLimit` keyed on
  `ratelimit:${ip}` only, so a 5/min route and a 10/min route shared one counter and one
  window — whichever wrote last reset the other's expiry. Keys are now
  `ratelimit:${bucket}:${ip}`.
- **Three unauthenticated read surfaces were unbudgeted.** `GET /metrics` (queue depth, error
  counts, an R2 `list()` per call), `POST /api/v1/kb/search` (Workers AI embedding + database
  fallback — anonymous AI spend) and `POST /api/v1/dlq/validate` now carry per-IP budgets of
  60/20/20 per minute and return `429` with `Retry-After`.

### Correctness

- **The Robotics flight recorder HUD rendered hard-coded fiction.** Any ticket whose
  telemetry category was `Robotics / Hardware Fault` displayed "DIVERGENCE DETECTED",
  "ELEVATED" and "E-Stop Triggered: YES" regardless of what the machine reported, while
  `support_tickets.metadata.flight_recorder_data` — the payload `/api/v1/robotics/fault-ingest`
  actually writes — was never read. The panel now loads the ticket metadata, renders the
  scalar readings it received (escaped through `sanitizePayload`), shows the node id, and says
  so when no recorder payload was ingested.

### Tests

- `src/components/tickets/OnyxInvestigationPanel.test.jsx` (4 cases) drives the real component
  against a mocked Supabase client and pins the honest-HUD behaviour, including that no
  fabricated strings survive.
- `onyx-edge-worker/test/read-surface-rate-limit.test.js` (6 cases) drives `worker.fetch()` with
  a real KV stub and fails if the bucket is dropped from the counter key again.
- Frontend 4 files / 20 tests → 5 files / 24 tests. Worker 18 files / 143 tests → 19 / 149.

---
## 2026-11-03 — Phase 160: unauthenticated mutation surface closed

Full evidence, line ranges and red→green logs: `AGENTS_VERIFICATION.d/2026-11-03-phase-160.md`.

### Security

- **`POST /api/v1/actions/rca/finalize` was unauthenticated and wired to the wrong handler.**
  The reachable handler read `{ ticketId, summary }` while the only caller sends
  `{ rcaLogId, notes }`, so it dropped an unrelated cache key and returned `{ success: true }`
  for an RCA that was never finalized — operators saw "finalized and locked" on no-ops. The
  handler that read the right fields had been registered ~300 lines further down and was
  unreachable. Now requires a real operator session and updates `hitl_audit_logs`.
- **`POST /api/v1/email/webhook` had no authentication.** Any POST rewrote
  `ticket_messages.metadata.delivery_status` for any message id. Now requires the EmailIt MAC
  or the internal relay signature; `503` when the secret is unbound.
- **`POST /api/v1/email/inbound` failed open.** The guard was
  `if (signature && env.EMAILIT_WEBHOOK_SECRET)`, so omitting the header — or running without
  the secret — skipped verification entirely and allowed anonymous ticket/message injection.
  Now fails closed.
- **`POST /email/daily-summary` had no authentication** and would mail the executive digest to
  anyone who asked. Now requires the internal relay credential.
- **Two dead duplicate route registrations removed:** `POST /api/v1/tickets/callback` (the
  unreachable copy had no `ticketId` guard and no telemetry) and the second
  `/api/v1/actions/rca/finalize`.
- **`validateAttachment` always returned `{ valid: true }`**, making the intake reject branch
  unreachable. Now enforces a 5 MB cap and a png/jpeg/pdf allow-list.
- **Two pairs of migrations shared a version prefix** (`20260901000000`, `20261001000000`).
  Supabase keys `schema_migrations` on the version, so the second file in each pair was
  silently never applied — including `team_profiles`, which `/api/v1/auth/sso/exchange`
  writes to. Renumbered to `…000001`.
- **`wrangler.toml` shipped placeholder KV ids** (`fake-status-kv-id-for-now`,
  `fake-hitl-kv-id-for-now`). `wrangler deploy --dry-run` only checks the id's shape, so CI
  stayed green while a real deploy would fail or ship a worker whose `STATUS_KV`/`HITL_KV`
  reads threw. Replaced with explicit `REPLACE_WITH_…` markers and a test that fails on
  placeholders.

### Reliability

- **`handleStaleTicketSweep` was an empty function on the 15-minute cron** — 96 no-op
  invocations a day. Now sweeps stale `open` tickets and records one event each, honouring a
  `stale_sweep_minutes` preference.
- **Large intake attachments returned 500.** `btoa(String.fromCharCode(...new Uint8Array(buffer)))`
  throws `RangeError: Maximum call stack size exceeded` past a few hundred KB; measured at
  1 MB. Replaced with a chunked encoder.
- **`logEnd` was a no-op** called from twelve request paths; now persists a
  `request_completed` event via `ctx.waitUntil`.
- **Stale cron comment corrected.** `0 3 * * *` is 03:00 UTC (previous evening in Central),
  not "10:00 AM UTC".

### Tests

- **The frontend suite was reporting the edge worker's coverage as its own.** With no
  `test.include`, vitest swept `onyx-edge-worker/test/**`, so `npm test` reported 17 files /
  124 tests while exactly one file exercised frontend code. `vite.config.js` now scopes the
  frontend run and the worker directory is excluded.
- **First real frontend coverage:** `SLABadge.test.jsx` (7), `sanitize.test.js` (5),
  `edgeWorkerUrl.test.js` (4). Frontend run is now 4 files / 20 tests of frontend code.
- `onyx-edge-worker/test/unauth-surface.test.js` (20) and `wrangler-config.test.js` (3) drive
  the real worker module; 14 of the 18 original cases failed against pre-fix `src/index.ts`.
- Worker suite 16 files / 120 tests → **18 files / 143 tests**.

## 2026-11-02 — Phase 159: internal trust boundary + AI consolidation completion

### Security

- **Signature replay window.** `validateInternalSignature` now verifies
  `HMAC("<X-Axim-Timestamp>.<raw body>")` and rejects anything outside ±300 s. Timestamp-less
  v1 signatures still verify, but only until `AXIM_SIG_LEGACY_UNTIL` (default `2026-12-31`) and
  with a warning on every acceptance. Signature headers must be 32 bytes of hex; previously
  arbitrary strings were `parseInt`-ed and `NaN` silently became `0`.
- **Coding Lab dispatch is replay-proof.** `POST /api/v1/tasks/dispatch` sends
  `X-Axim-Timestamp` and `X-Axim-Signature-Version: 2` in addition to the signature.
- **Spoofable intake bypass removed.** `X-Axim-Default-Source: website[_authenticated_internal]`
  no longer skips HMAC verification on `POST /api/v1/webhooks/intake`. That header is
  client-controlled and nothing legitimate sent it.
- **Open mail relay closed.** `POST /api/onyx/email/hitl-request` accepted any non-empty bearer
  token and mailed a caller-supplied address from `@axim.io`. It now requires a real operator
  session or the service bearer.
- **Presence-only auth fixed.** `POST /api/v1/tickets/:id/generate-rca` validated that a token
  existed, not that it was real.
- **Timing-safe secret comparisons.** Every shared-secret header check
  (`X-Axim-Network-Key`, `Bearer <AXIM_ONYX_SECRET>`) goes through `constantTimeEqualSecret`;
  the EmailIt webhook MAC no longer compares with `===`.
- **EmailIt webhook replay closed.** The `t=` timestamp is now enforced (300 s) instead of parsed
  and discarded.
- **Circuit breaker actually opens.** Provider health for `EmailDispatchManager` moved to module
  scope; it previously lived on a per-request instance and reset before it could ever trip.
- **PHP2Shell shield widened.** Percent-decoded probe matching, 403 for malformed encoding, and
  403 for filesystem path probes (`/etc/`, `/proc/`, `/.env`, `/.git`, `/server-status`,
  `/actuator`).

### AI

- **Zero raw provider calls left in the edge worker.** RCA generation (on-demand and on
  resolution), auto-draft, robotics RCA and the `/api/command` tool router all route through
  `callAIWithFailover`.
- **`streamAIWithFailover()` added.** Streaming triage keeps the DeepSeek → Anthropic →
  degraded fallback chain and normalises every provider to OpenAI-shaped SSE deltas.

### Build & tooling

- `onyx-edge-worker/package-lock.json` repaired — `npm ci` failed outright on `main`
  (`Missing: esbuild@0.28.2 from lock file`).
- `AppLayout.jsx` no longer returns between hooks (rules-of-hooks violation that skipped the
  urgent-alert subscription and SLA poller on first paint).
- `telemetry.js` empty `catch` blocks now log the degradation they swallow.
- `wrangler.toml`: dropped the invalid `lifecycle_retention_days` field on the R2 binding
  (silently ignored, so the 365-day retention never applied) and documented the real command.
- Deleted `onyx-edge-worker/test/signature.test.js` — it mocked `fetch` and asserted the mock.
  Replaced by 22 tests that drive the real worker.
