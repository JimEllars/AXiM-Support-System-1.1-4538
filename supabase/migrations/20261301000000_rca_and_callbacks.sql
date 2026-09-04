CREATE TABLE IF NOT EXISTS public.rca_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  generated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rca_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for rca_documents" ON public.rca_documents FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.support_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.support_callbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for support_callbacks" ON public.support_callbacks FOR ALL USING (true) WITH CHECK (true);
