-- Fast lookup for Chatbase conversation threading
CREATE INDEX IF NOT EXISTS idx_support_tickets_chatbase_conv
  ON public.support_tickets ((metadata->>'chatbase_conversation_id'))
  WHERE metadata->>'chatbase_conversation_id' IS NOT NULL;

-- Phase 163: this index referenced `provider`, a column no migration creates, so
-- the whole file aborted here and none of the three indexes below were ever
-- created. `logTelemetry()` writes provider/model/latency_ms/tokens_used and
-- carries a 42703 fallback for exactly this reason, so the column is the
-- intended shape. Created here rather than in a later migration because a later
-- version cannot repair an earlier file's failure.
ALTER TABLE public.ticket_ai_telemetry
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Fast filtering for telemetry dashboards
CREATE INDEX IF NOT EXISTS idx_ticket_ai_telemetry_created_provider
  ON public.ticket_ai_telemetry (created_at DESC, provider);

CREATE INDEX IF NOT EXISTS idx_ticket_ai_telemetry_ticket_lookup
  ON public.ticket_ai_telemetry (ticket_id, created_at DESC);

-- Fast lookup for audit events & SLA tracking.
-- Phase 163: `events_ax2024` has `created_at`, not `timestamp` — the same drift
-- phase 162 fixed in thirteen worker queries, still present in the DDL. This
-- statement aborted the migration too.
CREATE INDEX IF NOT EXISTS idx_events_ax2024_type_created_at
  ON public.events_ax2024 (type, created_at DESC);
