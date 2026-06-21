ALTER TABLE public.ticket_ai_telemetry
ADD COLUMN IF NOT EXISTS is_curated BOOLEAN DEFAULT false;
