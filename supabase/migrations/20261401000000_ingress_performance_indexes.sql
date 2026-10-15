-- Fast lookup for Chatbase conversation threading
CREATE INDEX IF NOT EXISTS idx_support_tickets_chatbase_conv
  ON public.support_tickets ((metadata->>'chatbase_conversation_id'))
  WHERE metadata->>'chatbase_conversation_id' IS NOT NULL;

-- Fast filtering for telemetry dashboards
CREATE INDEX IF NOT EXISTS idx_ticket_ai_telemetry_created_provider
  ON public.ticket_ai_telemetry (created_at DESC, provider);

CREATE INDEX IF NOT EXISTS idx_ticket_ai_telemetry_ticket_lookup
  ON public.ticket_ai_telemetry (ticket_id, created_at DESC);

-- Fast lookup for audit events & SLA tracking
CREATE INDEX IF NOT EXISTS idx_events_ax2024_type_timestamp
  ON public.events_ax2024 (type, timestamp DESC);
