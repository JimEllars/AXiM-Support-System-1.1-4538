-- Create Events Table for Core Sync
CREATE TABLE IF NOT EXISTS public.events_ax2024 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.events_ax2024 ENABLE ROW LEVEL SECURITY;

-- Allow insert from service role or authenticated
CREATE POLICY "Allow insert for service role and authenticated users"
ON public.events_ax2024 FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow select for service role and authenticated users"
ON public.events_ax2024 FOR SELECT
USING (true);
