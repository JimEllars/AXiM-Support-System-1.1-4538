# AGENTS_VERIFICATION

Verification appendix for the AXiM Support System. One section per change set; every
entry names the files and line ranges touched, the proving test, and the verbatim
output. The standard this file holds itself to is the one in
`review/WORKING_AGREEMENT.md`:

- the test executes the real code path (imports the module, does not re-declare it);
- the failure is demonstrated *before* the fix;
- the project's real build command passes, not just a type checker.

---

## Appendix index

Each change set now gets its own file so parallel branches stop conflicting on this one
(the working agreement records three rebase conflicts caused by appending here):

| Date | Phase | File |
|---|---|---|
| 2026-11-05 | 162 — worker schema drift, honest cron sweeps, route-level bundle split | [`AGENTS_VERIFICATION.d/2026-11-05-phase-162.md`](AGENTS_VERIFICATION.d/2026-11-05-phase-162.md) |
| 2026-11-04 | 161 — build integrity, read-surface budgets, honest robotics HUD | [`AGENTS_VERIFICATION.d/2026-11-04-phase-161.md`](AGENTS_VERIFICATION.d/2026-11-04-phase-161.md) |
| 2026-11-03 | 160 — unauthenticated mutation surface closed | [`AGENTS_VERIFICATION.d/2026-11-03-phase-160.md`](AGENTS_VERIFICATION.d/2026-11-03-phase-160.md) |

## 2026-11-02 — Phase 159: internal trust boundary + AI consolidation completion

**Branch:** `fix/support-phase-159-trust-boundary-and-ai-consolidation`
**Base:** `origin/main` @ `006bed3` (no human commits in the preceding 24h; all 7 open PRs are Dependabot)

### Baseline found red on main (fixed before any feature work)

| Gate | State on `main` | Cause |
|---|---|---|
| `npm run lint` | **5 errors** | 3 × `react-hooks/rules-of-hooks` in `AppLayout.jsx`, 2 × `no-empty` in `telemetry.js` |
| `npm --prefix onyx-edge-worker ci` | **EUSAGE** | `package-lock.json` out of sync with `package.json` (esbuild 0.28.2 / vitest 4 tree missing) |

### Changes

#### 1. `onyx-edge-worker/src/index.ts` L31–L200 — internal signature primitives

- Added `INTERNAL_SIGNATURE_MAX_SKEW_SECONDS = 300`, `INTERNAL_SIGNATURE_DEFAULT_SUNSET`,
  `constantTimeEqualSecret()`, `hexToBytes()`, `bytesToHex()`, `importHmacKey()`,
  `signInternalRequest()` (v2 signer), `internalSignatureLegacySunset()`,
  `authorizeInternalRelay()`.
- Rewrote `validateInternalSignature()` (L133–L186):
  - **was:** HMAC over the raw body only, no timestamp, no replay window.
  - **now:** v2 = `HMAC("<X-Axim-Timestamp>.<raw body>")` with the timestamp required to be
    within ±300 s; v1 (timestamp-less) is still accepted but only until `AXIM_SIG_LEGACY_UNTIL`
    (default `2026-12-31`) and logs a warning on every use. Signatures must be 32 bytes of
    lowercase hex — the old code ran `parseInt` over arbitrary strings and treated `NaN` as `0`.
  - Why: a captured body-only signature verified forever. This is the same defect recorded
    against the Onyx edge bridge (`9fd2004f`), and it was still open here.

#### 2. `onyx-edge-worker/src/index.ts` — replay-proof Coding Lab dispatch (L3530–L3560)

`POST /api/v1/tasks/dispatch` now signs `<timestamp>.<body>` and sends
`X-Axim-Signature`, `X-Axim-Signature-Version: 2`, `X-Axim-Timestamp`. Previously it sent a
body-only signature, so the receiver had no way to bound replay.

#### 3. `onyx-edge-worker/src/index.ts` — resolution callback hardened (L3555–L3610)

- `POST /api/v1/tickets/:id/resolve-from-coder` keeps the existing v2 check (now with the replay
  window).
- The two duplicate `/api/v1/tickets/callback` gates, `handleTicketResolved` and
  `handleMessageEgress` replaced `header !== env.AXIM_SERVICE_KEY` with
  `authorizeInternalRelay()` (signature first, constant-time shared key second).
- `POST /api/v1/robotics/fault-ingest` no longer compares the bearer to `AXIM_INTERNAL_KEY`
  with `!==`; it accepts a v2 signature or the legacy bearer compared in constant time.

#### 4. `onyx-edge-worker/src/index.ts` L4990–L5150 — spoofable intake bypass removed

`handleWebhookIntake` trusted `X-Axim-Default-Source: website_authenticated_internal` (and,
in the JSON branch, `: website`) to skip HMAC verification. Both are client-controlled
headers, so any unauthenticated caller could inject tickets. Nothing in the repo or the
frontend ever sends `website_authenticated_internal`; the internal proxy already carries
`X-Axim-Network-Key`, so the header path was dead grant surface and was deleted.

#### 5. `onyx-edge-worker/src/index.ts` L2580–L2680, L5920 — open relay + presence-only auth

`POST /api/onyx/email/hitl-request` accepted *any* non-empty `Authorization` header and then
mailed a caller-supplied address from the platform domain. It now requires a real Supabase
session or the service bearer (constant-time).
`POST /api/v1/tickets/:id/generate-rca` only checked that a token existed; it now validates the
session.

#### 6. `onyx-edge-worker/src/index.ts` L1310–L1345 — PHP2Shell / traversal shield

Still returns 403 for CGI argument injection and traversal probes, now also after
percent-decoding (so `%3f-d` and encoded traversal are caught), for malformed encoding, and
for filesystem path probes (`/etc/`, `/proc/`, `/.env`, `/.git`, `/server-status`,
`/actuator`, …). The URL parser collapses `%2e%2e/` into `..` before the worker sees it, so
`/api/v1/%2e%2e/%2e%2e/etc/passwd` arrives as a clean `/etc/passwd` — previously answered
401 by falling through the router.

#### 7. AI consolidation — zero raw provider calls remain in `index.ts`

| Was | Now |
|---|---|
| `generate-rca` raw DeepSeek fetch (L2797) | `callAIWithFailover(..., taskType: "reasoning")` |
| resolved-ticket RCA raw DeepSeek + Anthropic fetches | `callAIWithFailover` |
| auto-draft raw DeepSeek + Anthropic fetches | `callAIWithFailover`, provenance now `provider:model` |
| `/api/command` raw Anthropic tool-use fetch | `callAIWithFailover({ tools: ONYX_TOOLS })` |
| `/api/v1/onyx-bridge/stream` raw DeepSeek SSE passthrough | new `streamAIWithFailover()` |

`grep -n "api.deepseek.com\|api.anthropic.com/v1/messages" onyx-edge-worker/src/index.ts` → no matches.

#### 8. `onyx-edge-worker/src/ai/llmClient.ts` L392–L534 — `streamAIWithFailover()`

DeepSeek SSE passthrough → Anthropic SSE translated into OpenAI-shaped deltas → degraded
single-chunk message. Keeps the browser on one wire format regardless of provider.

#### 9. `onyx-edge-worker/src/email/dispatch.ts` L41–L60, L88–L100, L245–L330 — breaker + MAC

- **Breaker was per-instance.** Every handler builds `new EmailDispatchManager(...)`, so
  `tripCircuitBreaker()` set state on an object that was thrown away at the end of the request
  and the breaker never opened — EmailIt was re-probed on every send during an outage. State
  (open flag, cooldown, quota telemetry) moved to a module-scoped `SHARED_BREAKER`.
- `verifyEmailItSignature()` parsed `t=` and then ignored it, so an inbound webhook signature
  verified forever; it now enforces the 300 s window, and the MAC comparison is constant time
  instead of `===`.

#### 10. Frontend — `src/components/layout/AppLayout.jsx`, `src/lib/telemetry.js`

- `AppLayout` returned a loading gate *between* hooks: on first paint 2 hooks ran, and once
  `isInitialized` flipped to true 4 ran — a rules-of-hooks violation, and the realtime urgent
  subscription plus the SLA interval were skipped on the initial render. The gate moved below
  every hook.
- `telemetry.js` empty `catch` blocks now log at debug level and explain the degradation
  (sessionStorage unavailable / corrupt buffer) instead of swallowing silently.

#### 11. `onyx-edge-worker/wrangler.toml` L44–L52

`lifecycle_retention_days = 365` is not a valid `r2_buckets` field; wrangler warned
`Unexpected fields found in r2_buckets[0]` and ignored it, so the 365-day retention never
applied. Replaced with the correct `wrangler r2 bucket lifecycle add` invocation.

#### 12. `onyx-edge-worker/package-lock.json` — lock repaired

`npm ci` failed with `EUSAGE … Missing: esbuild@0.28.2 from lock file`. Regenerated with
`npm install --package-lock-only`; no `package.json` version ranges were changed.

### Test changes

| File | Change |
|---|---|
| `onyx-edge-worker/test/edge-trust-boundary.test.js` | **new**, 366 lines, 22 tests. Imports `../src/index.ts` and drives `worker.fetch()` with real `Request` objects; Supabase is mocked, everything else is real. |
| `onyx-edge-worker/test/stream-failover.test.js` | **new**, 109 lines, 3 tests. Real `streamAIWithFailover`, mocked `fetch`; asserts OpenAI-shaped deltas and `[DONE]`. |
| `onyx-edge-worker/test/email-circuit-breaker.test.js` | **new**, 104 lines, 6 tests. Real `EmailDispatchManager`. |
| `onyx-edge-worker/test/signature.test.js` | **deleted**, 15 lines. It mocked `fetch` and asserted the mocked response — it never called the worker, so it passed no matter what the gate did. Replaced by the suite above. |
| `onyx-edge-worker/test/email.test.js` | `beforeEach` now resets the (correctly) shared provider health. |
| `onyx-edge-worker/vitest.config.ts` | `testTimeout`/`hookTimeout` 20 s — importing the real worker per case exceeded the 5 s default under load and produced false reds. |

### Demonstrated-before-the-fix

```
# onyx-edge-worker, src/index.ts reverted via `git stash push -- onyx-edge-worker/src/index.ts`
 Test Files  1 failed (1)
      Tests  9 failed | 13 passed (22)
  × accepts a fresh v2 signature over "<timestamp>.<body>"
  × accepts a legacy body-only signature before the sunset and rejects it after
  × rejects unsigned JSON intake that claims to be the internal website proxy
  × rejects unsigned JSON intake that claims to be the public website form
  × blocks /api/v1/../../etc/passwd with 403
  × blocks /api/v1/%2e%2e/%2e%2e/etc/passwd with 403
  × sends X-Axim-Timestamp and a v2 signature the receiver can verify
  × accepts a v2 HMAC signature
  × rejects a presence-only bearer token

# onyx-edge-worker, src/email/dispatch.ts reverted
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
  × opens the breaker so the next dispatch manager skips the failing provider
  × rejects a captured signature replayed outside the window
```

### Final verification (all green, run after the last edit)

```
$ npm run lint                     # repo root
> eslint .
(no output; exit 0)

$ npx vitest run                   # repo root
 RUN  v4.1.11 /workspace/review/axim-support
 Test Files  17 passed (17)
      Tests  124 passed (124)
   Duration  213.84s

$ npm run build                    # repo root
dist/index.html                     1.03 kB │ gzip:   0.51 kB
dist/assets/index-DA2pFRJ0.css  2,032.41 kB │ gzip: 1,366.08 kB
dist/assets/index-C3bdx016.js   1,648.60 kB │ gzip:   431.63 kB │ map: 6,948.56 kB
✓ built in 20m 32s

$ npx vitest run                   # onyx-edge-worker
 Test Files  16 passed (16)
      Tests  120 passed (120)

$ npx tsc --noEmit                 # onyx-edge-worker
(no output; exit 0)

$ npm run build                    # onyx-edge-worker
  dist/index.js  1.7mb ⚠️
⚡ Done in 6550ms

$ npx wrangler deploy --dry-run    # onyx-edge-worker
Total Upload: 1803.32 KiB / gzip: 318.50 KiB
--dry-run: exiting now.
```

### Not done / carried forward

- **Not deployed.** Merging does not deploy: the worker needs `wrangler deploy`, and the
  satellite senders (Coding Lab, fleet gateway, DB triggers) must ship a v2 signer before
  `2026-12-31` or their callbacks start returning 401.
- `test/telemetry.test.js`, `test/health.test.js`, `test/command.test.js` and parts of
  `test/metrics.test.js` still contain self-fulfilling assertions of the deleted
  `signature.test.js` pattern. They were left in place this run rather than half-deleted;
  each needs a real test before it is removed.
- `handleTicketResolved` and `handleAutoDraft` still have unreachable provider-specific
  branches removed but no per-provider latency assertion; `ticket_ai_telemetry` writes are
  unchanged.
- Frontend bundle is 1.65 MB JS / 2.03 MB CSS with no code splitting — a real performance
  item, unrelated to this phase.
- `Continued Development Plan.md` and `DEBUGGING_NOTES.md` do not exist in this repository
  (they live in `axim-core-v1.2`), so there was nothing to reconcile here.
