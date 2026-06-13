# AXiM Support System - Reference for Coding Agents

## System Overview
AXiM Support System — AI-powered enterprise support ticketing.
Stack:
- **Frontend**: React/Vite (deployed on Cloudflare Pages)
- **Backend**: Cloudflare Workers edge backend
- **Database**: Supabase (Postgres + pgvector + Realtime)
- **AI Core**: Anthropic Claude 3 Haiku

## Key Environment Variables
- \`SUPABASE_URL\`: Supabase instance URL
- \`SUPABASE_SERVICE_ROLE_KEY\`: Supabase backend root key
- \`ANTHROPIC_API_KEY\`: For Anthropic Claude 3 API
- \`AXIM_ONYX_SECRET\`: Authorization token for internal webhook routes
- \`AXIM_SERVICE_KEY\`: Key for hitting Core API sandbox resolution endpoint
- \`CORE_API_URL\`: Primary AXiM Core proxy base URL
- \`RESEND_API_KEY\`: Resend configuration
- \`RESEND_FROM_EMAIL\`: Support email string for egress
- \`ALLOWED_ORIGINS\`: For CORS setup

## Edge Worker Routes Table
| Route | Purpose |
|-------|---------|
| \`/api/v1/onyx-bridge/stream\` | Realtime SSE streaming triage endpoint |
| \`/api/v1/onyx-bridge/draft\` | Haiku drafting mechanism |
| \`/vector-search\` | RAG vector matching over memory banks |
| \`/api/v1/onyx/generate-suggestion\` | Ticket suggestion prompt logic |
| \`/batch-triage\` | Triage processing mechanism |
| \`/api/v1/webhooks/ticket-resolved\` | Internal ticket closure cleanup hook |
| \`/api/v1/webhooks/public-ingress\` | Public webhook endpoint for new submissions |
| \`/api/v1/webhooks/public-intake\` | Duplicate/Alt name for intake |
| \`/webhooks/intake\` | Another intake route path |
| \`/api/v1/webhooks/egress\` | Dispatches email via Resend |
| \`/api/v1/webhooks/feedback\` | Connects CSAT feedback module |
| \`/api/v1/webhooks/sandbox-resolution\`| Commits sandbox patches and alerts |
| \`/api/v1/actions/resolve\` | Processes approved HITL logs |
| \`/health\` | Check node status |

## Key DB Tables
- \`support_tickets\`: The main collection of tickets
- \`ticket_messages\`: Individual replies and AI logs
- \`ticket_ai_telemetry\`: Haiku confidence logic storage
- \`contacts_ax2024\`: Deskera CRM clone table
- \`hitl_audit_logs\`: Required gate for Tier-3/Tier-4 changes
- \`events_ax2024\`: Central real-time SSE stream log
- \`memory_banks\`: pgvector table storing historical RCA
- \`product_feedback\`: CSAT module store

## Auth Pattern
- Most internal routes use \`Authorization: Bearer \${AXIM_ONYX_SECRET}\`
- Sandbox resolution uses \`AXIM_SERVICE_KEY\`
- Public ingress uses origin checking + secret injection

## Triage Flow Summary
Ticket arrives → Anthropic triage → confidence check → if < 85 dispatch to sandbox → insert ticket_ai_telemetry → if > 90 deflect with auto-draft → SLA set.

## Known Patterns
- All background work uses \`ctx.waitUntil()\` to avoid killing the response.
- All errors use \`logErr()\` (stores error telemetry).
- Rate limiting is handled via an in-memory \`rateLimitMap\`.
