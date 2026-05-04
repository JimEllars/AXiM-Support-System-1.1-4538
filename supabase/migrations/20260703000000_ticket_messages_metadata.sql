ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
