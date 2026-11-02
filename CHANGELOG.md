# Changelog

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
