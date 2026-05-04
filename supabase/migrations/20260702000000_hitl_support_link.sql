-- Create hitl_audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.hitl_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'pending',
    tool_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hitl_audit_logs ADD COLUMN IF NOT EXISTS support_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL;

ALTER TABLE public.hitl_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Support can view all hitl logs"
ON public.hitl_audit_logs FOR SELECT
USING (
    auth.jwt() ->> 'role' IN ('admin', 'support')
);

CREATE POLICY "Admins/Support can update hitl logs"
ON public.hitl_audit_logs FOR UPDATE
USING (
    auth.jwt() ->> 'role' IN ('admin', 'support')
);
