-- Add sla_breach_at to support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sla_breach_at TIMESTAMPTZ;
