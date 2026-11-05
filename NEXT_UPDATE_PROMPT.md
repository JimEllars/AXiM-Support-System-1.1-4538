# Phase 162 Completed (2026-11-05)
- **Deploy ordering matters now**: two new migrations must be applied *before* the Worker ships. `20261601000000_worker_written_columns.sql` adds `support_tickets.metadata` / `resolved_at` / `category`, `hitl_audit_logs.metadata`, `product_feedback.sentiment` / `customer_email` and the `Review-Patch-Pending` enum value; `20261601000001_fix_sla_escalation_function.sql` repairs a pg_cron function that has raised on every run since 2026-07-05. Both are idempotent, so re-running is free.
- **Four columns the Worker wrote were created by no migration.** The SLA breach guard could never persist (so the breach email and internal note repeated every 15 minutes per ticket), `resolve-from-coder` 500'd (the Coding Lab DLQ fault), robotics fault ingest never created a ticket, the executive email bridge never executed a directive, and CSAT returned 500. Evidence in `AGENTS_VERIFICATION.d/2026-11-05-phase-162.md`.
- **Thirteen `events_ax2024` queries filtered on `timestamp`; the column is `created_at`.** The nightly executive digest reported 0 autonomous escalations and 0 auto-resolutions, `/api/v1/health/*` reported `pending_initial_run` forever, the DLQ panel was always empty, and the leaderboard counted no memory renewals.
- **`handleSLASweep` escalated the same ticket twice per run** (two passes, one unguarded) and then repeated it 96 times a day because the second pass's guard depended on the missing `metadata` column. One pass now: persist the flag, then (only if that succeeded) note, event and email. Department leads are emailing recipients now instead of being named in an event that nobody received.
- **CSAT was 404 on read and 500 on write** (`assigned_to` vs `assignee_id`, `comment` vs `comments`, two missing columns). The leaderboard queried a `ticket_feedback` table that no migration creates, so every operator scored `avg_csat: 0`.
- **Two intake paths inserted the caller's email into the UUID `customer_id` column and `"default"` into the UUID `organization_id` column**, so the Chatbase bridge 500'd on the first message of every new conversation. Fixed with `resolveCustomerId()` / `uuidOrNull()`.
- **`escalate_breached_slas()` never ran successfully** — `priority != 'escalated'` is not an enum member and `assigned_to` is not a column. Rewritten with a `priority <> 'urgent'` guard so the database safety net and the Worker sweep cannot double-note.
- **`handleStaleTicketSweep` now escalates** instead of writing an event nothing reads: priority ≥ `high`, one internal note, `metadata.stale_escalated_at` guard.
- **`logErr` persists a `request_error` event** now; it was `console.error` only.
- **Entry bundle 1,185.52 kB → 700.09 kB** (gzip 341.73 → 207.12) with route-level `React.lazy()`; `echarts`, `echarts-for-react` and `@questlabs/react-sdk` removed as dead dependencies (lockfile −1,421 lines).
- **Frontend test gate**: `fileParallelism: false` replaces `maxWorkers: 2`. The failure was never the tests — `import('happy-dom')` is 21s of a hard-coded 60s fork-start budget. 24/24 green; worker suite 149 → 160 tests.

# Phase 162 Next Priorities
- **Deploy blockers, in order.** (1) Apply both 20261601000000/…000001 migrations. (2) Create the real `STATUS_KV` and `HITL_KV` namespaces and substitute the `REPLACE_WITH_…` ids — `handleStaleTicketSweep` and the HITL token store both depend on them. (3) Bind `EMAILIT_WEBHOOK_SECRET`, because `/api/v1/email/inbound` and `/api/v1/email/webhook` 401 (or 503) unsigned callers.
- **Add a migration-replay job to CI.** Every defect in this phase was schema drift between `src/index.ts` and `supabase/migrations`, and no gate would ever have caught them: the Worker tests mock Supabase and `wrangler deploy --dry-run` only checks binding shape. `supabase db reset` (or `pg_tmp` + psql) against the migration chain, plus a smoke insert per table the Worker writes, is the cheapest durable defence. Until that exists, the next drift will be found the same way — by reading 8,700 lines.
- **Audit the remaining column references.** Thirteen `events_ax2024` sites were wrong in the same direction. `support_tickets`, `team_profiles`, `hitl_audit_logs` and `rca_documents` have not been swept the same way; the replay job above is what makes that checkable instead of heroic.
- **`robotics/fault-ingest` creates a new urgent ticket per payload.** There is no dedupe on `node_id`, so a fleet gateway that retries or streams telemetry produces a ticket per event. Decide: one ticket per fault window (dedupe on `node_id` + open status), or a child event on an existing ticket.
- **Attachment bucket name mismatch.** `/api/v1/chat/upload-auth` signs uploads into `support-attachments`; the only bucket migration creates `ticket_attachments`. One is wrong and uploads will 404. Product decision.
- **`robot_fault_logs` still does not exist.** The flight recorder lives in `support_tickets.metadata.flight_recorder_data` and the panel reads it. Decide whether to promote it to a table before anything else writes a second shape.
- **Entry chunk is still 700 kB** (gzip 207). Vendor `manualChunks` for react/react-dom/react-router, `@supabase/supabase-js` and `framer-motion` is the next cheap win; `framer-motion` is imported by 10 files including `Login`, so it stays in the entry graph even after route splitting.
- **Frontend coverage is 24 tests for 45 components.** `TicketDetail.jsx`, `MessageThread.jsx`, `LiveChatPanel.jsx` and `OnyxCommandHub.jsx` still have none.
- **Replace the remaining stub tests**: `telemetry.test.js`, `health.test.js`, `command.test.js`, parts of `metrics.test.js`.
- **Retire the legacy shared-key path** once `[signature] accepted legacy …` warnings stop (sunset `2026-12-31`).

# Phase 161 Completed (2026-11-04)
- **Tailwind Was Not Running in Production Builds**: `vite.config.js` carried `css: { postcss: { plugins: [] } }`, which replaces Vite's `postcss.config.js` lookup and therefore skipped `tailwindcss` and `autoprefixer`. Every build emitted the `@tailwind`/`@apply` directives verbatim — 0.78 kB of CSS, app unstyled. Override removed; the build now emits 82.70 kB of utilities. Evidence in `AGENTS_VERIFICATION.d/2026-11-04-phase-161.md`.
- **2.03 MB Dead Stylesheet Removed**: `src/App.jsx` imported `@questlabs/react-sdk/dist/style.css` while nothing renders a Quest component (1.56 MB of it is one base64 PNG). CSS went 2,032.41 kB → 82.70 kB (gzip 12.83).
- **Frontend Test Gate Green Again**: the suite was red on a 2 vCPU box — vitest's hard-coded 60s fork-start timeout was being blown by four concurrent worker boots. Fixed by shrinking each fork's module graph (`react-icons` namespace imports) and pinning `maxWorkers: 2` in `vite.config.js`. 5 files / 24 tests.
- **`react-icons` Tree-Shaking Restored**: `SafeIcon` read the barrel through a computed key, so the whole Feather set shipped. Six-entry explicit registry plus named imports across seven components.
- **Three `${workerUrl}` Literal Bugs Fixed**: `TicketList.jsx`, `Customer360.jsx`, `RCADocumentBlock.jsx` returned the literal string `"${workerUrl}"` when `VITE_EDGE_WORKER_URL` was unset, so their requests could not resolve. All three use `src/lib/edgeWorkerUrl.js` now.
- **Rate-Limit Buckets Namespaced**: `checkRateLimit` keyed on `ratelimit:${ip}` for every caller, so routes with different budgets shared one counter and one window. Keys are `ratelimit:${bucket}:${ip}`.
- **Three Open Read Surfaces Budgeted**: `GET /metrics` (60/min), `POST /api/v1/kb/search` (20/min — it embeds the caller's query through Workers AI) and `POST /api/v1/dlq/validate` (20/min) now return `429` with `Retry-After`.
- **Robotics Flight Recorder HUD No Longer Fabricates**: the panel printed "DIVERGENCE DETECTED"/"ELEVATED"/"E-STOP: YES" for every robotics ticket without reading `support_tickets.metadata.flight_recorder_data`. It now renders the ingested readings (escaped) and says so when there are none.

# Phase 161 Next Priorities
- **Deploy blockers, in order.** (1) Create the real `STATUS_KV` and `HITL_KV` namespaces and substitute the `REPLACE_WITH_…` ids — `handleStaleTicketSweep` and the HITL token store both depend on them. (2) Bind `EMAILIT_WEBHOOK_SECRET` and point the EmailIt webhook at it *before* deploying, because `/api/v1/email/inbound` and `/api/v1/email/webhook` now 401 unsigned callers.
- **Drop `@questlabs/react-sdk` entirely.** The stylesheet is gone but the package is still a dependency; nothing imports it. Remove it in the next lockfile touch rather than bundling a dependency sweep into a code PR.
- **Split the JS bundle.** 1,185 kB in one chunk (gzip 342 kB). Route-level `lazy()` on `MemoryHub`, `TicketDetail` and the modal set is the cheapest win; `framer-motion` and `recharts` are the two heaviest leaves and both are route-local.
- **`robot_fault_logs` still does not exist.** The flight recorder lives in `support_tickets.metadata.flight_recorder_data` and the panel now reads it. Decide whether to promote it to a table before anything else writes a second shape.
- **Attachment bucket name mismatch.** `/api/v1/chat/upload-auth` signs uploads into `support-attachments`; the only bucket migration creates `ticket_attachments`. One is wrong and uploads will 404. Needs a product decision.
- **`logErr` still only console.errors** — it never persists, so failed requests leave no durable trace even though `logEnd` now does.
- **Wire the stale sweep into escalation.** `handleStaleTicketSweep` writes `ticket_stale_sweep` events that nothing consumes; it should feed `handleSLASweep`'s escalation path.
- **Replace the remaining stub tests**: `telemetry.test.js`, `health.test.js`, `command.test.js`, parts of `metrics.test.js`.
- **Frontend coverage is 24 tests for 45 components.** `TicketDetail.jsx`, `MessageThread.jsx`, `LiveChatPanel.jsx` and `OnyxCommandHub.jsx` still have none.

# Phase 160 Completed (2026-11-03)
- **Unauthenticated Mutation Surface Closed**: `POST /api/v1/actions/rca/finalize`, `POST /api/v1/email/webhook`, `POST /api/v1/email/inbound` and `POST /email/daily-summary` no longer accept anonymous callers. Details and line ranges in `AGENTS_VERIFICATION.d/2026-11-03-phase-160.md`.
- **RCA Finalize Contract Repaired**: the reachable handler read `{ ticketId, summary }` while `RCADocumentBlock.jsx` sends `{ rcaLogId, notes }`, so it returned `{ success: true }` without finalizing anything. It now requires a real operator session and updates `hitl_audit_logs`. The hardened duplicate handler that read the right fields was ~300 lines below and unreachable; it has been deleted.
- **Fail-Open Inbound Webhook Fixed**: `if (signature && env.EMAILIT_WEBHOOK_SECRET)` meant "no header" == "authorized". Now fails closed with `401`/`503`.
- **Dead Duplicate Routes Removed**: the second `POST /api/v1/tickets/callback` (no `ticketId` guard, no telemetry) and the second `/api/v1/actions/rca/finalize`.
- **`validateAttachment` Implemented**: was `return { valid: true }` unconditionally, so the intake reject branch was unreachable. Now 5 MB cap + png/jpeg/pdf allow-list.
- **Chunked Base64 Encoder**: `btoa(String.fromCharCode(...new Uint8Array(buffer)))` threw `RangeError` at 1 MB, turning a legal attachment into a 500.
- **`handleStaleTicketSweep` Implemented**: was an empty function on the 15-minute cron (96 no-op runs/day).
- **Migration Version Collisions Resolved**: `20260901000000_team_profiles.sql` → `…000001`, `20261001000000_egress_webhook_tables.sql` → `…000001`. Supabase keys `schema_migrations` on the version, so the second file in each pair was never applied.
- **`wrangler.toml` Placeholder Bindings Replaced**: `fake-status-kv-id-for-now` / `fake-hitl-kv-id-for-now` passed `--dry-run` (shape-only check) but would fail a real deploy. Now explicit `REPLACE_WITH_…` markers, guarded by `test/wrangler-config.test.js`.
- **Frontend Test Suite Un-bluffed**: `npm test` was running the edge worker's 16 test files (120 tests) because `vite.config.js` had no `test.include`. Now scoped to `src/**`; frontend is 4 files / 20 tests of real frontend code (`SLABadge`, `sanitize`, `edgeWorkerUrl`).

# Phase 160 Next Priorities
- **Deploy blockers, in order.** (1) Create the real `STATUS_KV` and `HITL_KV` namespaces and substitute the `REPLACE_WITH_…` ids — `handleStaleTicketSweep` and the HITL token store both depend on them. (2) Bind `EMAILIT_WEBHOOK_SECRET` and point the EmailIt webhook at it *before* deploying, because `/api/v1/email/inbound` and `/api/v1/email/webhook` now 401 unsigned callers.
- **`robot_fault_logs` does not exist.** No migration creates `public.robot_fault_logs` and no code references it. `/api/v1/robotics/fault-ingest` writes the flight recorder into `support_tickets.metadata.flight_recorder_data`, and `OnyxInvestigationPanel.jsx` only renders robotics when `ticket_ai_telemetry.category === 'Robotics / Hardware Fault'` — it never reads the metadata. Storage without display: pick the table or the metadata key and make the panel read it.
- **Attachment bucket name mismatch.** `/api/v1/chat/upload-auth` signs uploads into `support-attachments`; the only bucket migration creates `ticket_attachments`. One is wrong and uploads will 404. Needs a product decision.
- **Rate limit the unauthenticated read surfaces.** `GET /metrics` (queue depth, error counts) and `POST /api/v1/kb/search` (embeds the query, calls the AI failover chain) are open. `/api/v1/dlq/validate` is open too — validation-only, so DoS rather than data.
- **Wire the stale sweep into escalation.** `handleStaleTicketSweep` now writes `ticket_stale_sweep` events, but nothing consums them. It should feed `handleSLASweep`'s escalation path, otherwise it is only visible in `events_ax2024`.
- **`logErr` still only console.errors** — it never persists, so failed requests leave no durable trace even though `logEnd` now does.
- **Replace the remaining stub tests**: `telemetry.test.js`, `health.test.js`, `command.test.js`, parts of `metrics.test.js`.
- **Frontend coverage is 20 tests for 45 components.** `TicketDetail.jsx`, `MessageThread.jsx`, `LiveChatPanel.jsx` and `OnyxCommandHub.jsx` still have none.

# Phase 159 Completed (2026-11-02)
- **Internal Signature Replay Window**: `validateInternalSignature` now verifies `HMAC("<X-Axim-Timestamp>.<raw body>")` with a ±300s window, rejects non-hex signatures, and only tolerates timestamp-less v1 signatures until `AXIM_SIG_LEGACY_UNTIL` (default 2026-12-31) with a warning. Coding Lab dispatch sends `X-Axim-Timestamp` + `X-Axim-Signature-Version: 2`.
- **Intake Bypass Removed**: `X-Axim-Default-Source: website[_authenticated_internal]` no longer skips HMAC verification on `POST /api/v1/webhooks/intake`; the header was client-controlled and unused by any legitimate caller.
- **Relay/Relay Callback Hardening**: `tickets/callback`, `handleTicketResolved`, `handleMessageEgress` and `robotics/fault-ingest` use `authorizeInternalRelay()` (signature first, constant-time shared key second) instead of plaintext `!==`.
- **Open Mail Relay Closed**: `/api/onyx/email/hitl-request` requires a real operator session (or service bearer) before dispatching to a caller-supplied address.
- **AI Consolidation Completed**: no raw `api.deepseek.com` / `api.anthropic.com` calls remain in `onyx-edge-worker/src/index.ts`; generate-rca, resolution RCA, auto-draft, robotics RCA and the `/api/command` tool router all use `callAIWithFailover`.
- **Streaming Failover**: new `streamAIWithFailover()` in `src/ai/llmClient.ts` — DeepSeek SSE passthrough, Anthropic SSE translated to OpenAI-shaped deltas, degraded terminal message otherwise.
- **Email Circuit Breaker Fixed**: `EmailDispatchManager` provider health is module-scoped (it used to reset with every `new EmailDispatchManager(...)`), and `verifyEmailItSignature` now enforces the 300s timestamp window with a constant-time MAC compare.
- **PHP2Shell Shield Widened**: percent-decoded probe matching, 403 on malformed encoding, and 403 for filesystem path probes.
- **Build Gates Repaired**: `onyx-edge-worker/package-lock.json` regenerated (`npm ci` was failing), `AppLayout.jsx` rules-of-hooks violation fixed, empty `catch` blocks in `telemetry.js` explained, invalid `lifecycle_retention_days` removed from `wrangler.toml`.
- **Real Tests Introduced**: `edge-trust-boundary.test.js` (22), `stream-failover.test.js` (3), `email-circuit-breaker.test.js` (6) drive the real modules; the self-fulfilling `signature.test.js` was deleted.

# Phase 159 Next Priorities
- **Ship v2 signers to every satellite** before `2026-12-31`: Coding Lab, the robotics fleet gateway, and the DB triggers that call `tickets/callback` / `webhooks/ticket-resolved` / `webhooks/egress`. Watch for `[signature] accepted legacy ...` warnings and for 401s on `resolve-from-coder`.
- **Retire the legacy shared-key path**: once those warnings stop, delete the constant-time fallback in `authorizeInternalRelay` and require signatures only.
- **Replace the remaining stub tests**: `telemetry.test.js`, `health.test.js`, `command.test.js` and parts of `metrics.test.js` assert on their own mocks and prove nothing.
- **Split the frontend bundle**: 1.65 MB JS and 2.03 MB CSS ship in one chunk; route-level lazy loading and a Tailwind purge pass are overdue.
- **Tenancy for `ticket_ai_telemetry` / `ai_interactions`**: conversation history is still keyed by `user_id` only.

# Phase 149 Completed
- **DeepSeek Integration**: Refactored `llmClient.ts` to utilize DeepSeek (flash/pro) as primary AI, handling caching metrics (`prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, `cache_hit_ratio`), multi-tenant caching via `user_id`, strict abort timeouts, and a complete 4-tier failover array.
- **AI Consolidation**: Refactored major callsites in `index.ts` to use `callAIWithFailover` exclusively, persisting token and latency metrics.
- **EmailIt V2 Unification**: Migrated out of raw fetch calls to a centralized `EmailDispatchManager` class with automatic failover to Resend for `sendEmailItNotification`, `dispatchHITLNotification`, `dispatchHITLProposalAlert` and Intake confirmations.
- **UI Diagnostics Polish**: Badges added to rendering workflows representing the active fallback network (DeepSeek vs Anthropic) and disk caching performance metrics.

# Phase 150 Completed
- **Perimeter Security Lockdown**: Removal of frontend secrets, route normalization under `/api/v1/*`, and AXiM Core telemetry bridging.

# Phase 151 Completed
- **Timing-safe Chatbase Bridge**: \`verifyHmacSignature\` implementation, 1-hour SLA warning radar with executive alert dispatch, and auth session hydration lock.

# Phase 152 Completed
- **Public Intake Form**: Repaired public intake, DeepSeek beta gateway routing (\`/beta/chat/completions\`), 429 concurrency retry backoff, and unit test suites.

# Phase 153 Completed
- **Synchronous Chatbase Bot Reply Loop**: Immediate AI response during Chatbase bridge ingress.
- **Database Performance Indexes**: `chatbase_conversation_id`, `ticket_ai_telemetry` and `events_ax2024`.
- **CSAT Feedback Route & Sentiment Analysis**: Analyzing customer feedback sentiment via DeepSeek and saving to `product_feedback`.
- **Live Carrier Telemetry**: Added email carrier telemetry logic inside `CoreHealthDiagnosticsModal.jsx`.

# Phase 154 Completed
- **Diagnostics Resiliency**: Fixed array destructuring misalignment in `CoreHealthDiagnosticsModal.jsx` and normalized `/api/v1/email/health` ingress.
- **Operator Subscriptions**: Applied debounced Supabase Realtime listeners to `OperatorLeaderboard.jsx`.
- **Nightly Digest**: Wired 9:00 PM CST (`0 3 * * *`) nightly cron trigger with active HTML URL routing for executive actions.

# Phase 155 Completed
- **HITL Email Unification**: Refactored `dispatchHITLNotification` from raw fetches to the `EmailDispatchManager` circuit breaker.
- **SLA Triage Filter**: Mapped `showSlaWarnings` toggle in `Dashboard.jsx` to filter for `<60m` active warnings.
- **Inbound Receipts**: Wired automated customer receipt dispatches to `handleWebhookIntake`.

# Phase 156 Completed
- **SLA Breach Auto-Escalation**: `handleSLASweep` automatically bumps breached tickets to `urgent` priority and emails the executive team.
- **Firewall Telemetry**: Added `X-Axim-Client: web-intake` headers to `PublicIntake.jsx`.
- **Metrics Resiliency**: Added explicit division-by-zero guards to DeepSeek prompt-cache telemetry calculations.

# Phase 157 Completed
- **Cron Digest Execution**: Locked `generateAndSendExecutiveDigest` to strictly fire on the `0 3 * * *` tick, preventing duplicate dispatches.
- **Full-Text Search Migration**: Deployed a non-destructive Supabase migration adding a GIN index and generated `tsvector` column for highly performant queries.
- **DLQ Edge Routing**: Normalized `/api/v1/dlq/retry/:id` with token validation to clear failed queue blocks securely.

# Phase 158 Completed
- **Coder Gateway Interlock**: Added Task Dispatch Proxy (\`POST /api/v1/tasks/dispatch\`) to forward operator tasks to the Coding Lab edge worker, and an Automated Resolution Callback (\`POST /api/v1/tickets/:id/resolve-from-coder\`) to accept resolved status updates with verified HMAC signatures.
- **Edge Hardening**: Validated edge ingress in \`onyx-edge-worker\` via PHP2Shell defense pattern matching, preventing directory traversal (\`..\`) and CGI injection (\`?-d\`).
- **AI Consolidation**: Eliminated raw DeepSeek/Anthropic fetch blocks across \`handleTicketResolved\`, \`handleAutoDraft\`, and RCA functions. Fully migrated to \`callAIWithFailover\` ensuring proper cross-provider fallback handling.
- **Robotics Flight Recorder RCA**: Added \`POST /api/v1/robotics/fault-ingest\` which automatically spins up urgent Robotics Support tickets upon hardware fault ingestion, followed by Onyx AI analysis parsing the sensor payload.
- **Robotics HUD**: Modified \`OnyxInvestigationPanel.jsx\` to present a Robotics Flight Recorder HUD if the ticket category is 'Robotics / Hardware Fault'.

# Phase 157 Completed
- **Cron Digest Execution**: Locked `generateAndSendExecutiveDigest` to strictly fire on the `0 3 * * *` tick, preventing duplicate dispatches.
- **Full-Text Search Migration**: Deployed a non-destructive Supabase migration adding a GIN index and generated `tsvector` column for highly performant queries.
- **DLQ Edge Routing**: Normalized `/api/v1/dlq/retry/:id` with token validation to clear failed queue blocks securely.
