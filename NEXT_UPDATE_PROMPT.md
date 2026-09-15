# NEXT_UPDATE_PROMPT

Progress made in this session:
- Resolved RCADocumentBlock UI Failure: Made it handle missing data gracefully and parse Markdown securely with fallback styles.
- Hardened Telemetry (`src/lib/telemetry.js`): Switched to `requestIdleCallback` (with timeout fallback) for batching telemetry without blocking UI thread, and handled offline states securely.
- Polished TicketList & Dashboard UI: Added clear visual priority cues (pill counters for active queue status), modernizing the layout.
- Cloudflare Edge Worker Audited: Patched `OPTIONS` request headers for CORS preflight, and added `AI_SERVICE_UNAVAILABLE` JSON fallback responses.
- Consolidated Workspace: Moved utility `.cjs` files to `scripts/maintenance/` and removed scattered patch files, updating `package.json` correspondingly.
- Passed full `npm run test` suite and edge worker tests.

Next possible increments:
- Continue increasing e2e coverage with playwright tests if necessary.
- Add advanced rate limiting to Edge Worker.

# Increment Completed: Production Hardening & Telemetry Activation
*Date: 2026-09-15T18:23:25.533Z*

- **Milestone 1**: Telemetry pipeline activated. Wired src/lib/telemetry.js to the edge worker using `onyxService.recordTelemetry`. The edge worker is updated to support UI events and inserts to `ticket_ai_telemetry`.
- **Milestone 2**: HITL feedback loops wired. `ActionProposalBlock.jsx` and `AutoDraftWhisper.jsx` execute background fetch calls to `autodraft-feedback`, persisting to `memory_banks` and `product_feedback`.
- **Milestone 3**: DLQ hardening & Headers. Wrapped `handleBatchTriage`, `handleAutoDraft`, and `handleExecuteAction` in try/catch to buffer to `DLQ_BUCKET` if a timeout/key error occurs, returning `{ status: 'degraded', queued_to_dlq: true }`. Included security headers (`X-Onyx-Edge-Region`, `X-Onyx-Execution-Time-MS`). Added comprehensive `handleHealthCheck`.
- **Milestone 4**: UI/UX. `MessageThread.jsx`, `AutoDraftWhisper.jsx`, and `OnyxInvestigationPanel.jsx` import and apply `sanitizePayload`. `CoreHealthIndicator.jsx` throttled to 30s.

All tests (`npm test`) pass across root and `onyx-edge-worker`. Build executes successfully.
