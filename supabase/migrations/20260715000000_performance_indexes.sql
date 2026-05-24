-- Index on ticket status and priority for filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON public.support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- Index on ticket messages for thread loading
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id, created_at DESC);

-- Index on events for realtime filtering
CREATE INDEX IF NOT EXISTS idx_events_ax2024_type ON public.events_ax2024(type, created_at DESC);

-- Index on HITL logs for action proposal lookups
CREATE INDEX IF NOT EXISTS idx_hitl_logs_ticket_id ON public.hitl_audit_logs(ticket_id, status);
