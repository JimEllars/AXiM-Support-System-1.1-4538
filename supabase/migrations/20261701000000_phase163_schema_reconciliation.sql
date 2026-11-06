-- Phase 163: reconcile the columns and one table the worker reads and writes
-- against what the migration chain actually creates.
--
-- Same failure mode as 20261601000000_worker_written_columns.sql (phase 162):
-- the worker referenced columns no migration creates. Every statement here is
-- additive and idempotent. Downstream effect of each is noted because most of
-- these were silent — the worker did not check the error, so the feature simply
-- reported success and stored nothing.
--
-- `provider` on ticket_ai_telemetry is added by
-- 20261401000000_ingress_performance_indexes.sql instead, because that file
-- indexes it and a later migration cannot repair an earlier file's failure.

-- 1. team_profiles.role / updated_at
--
--    701:   .from("team_profiles").select("email, role").in("role", [...])
--    1458:  .from("profiles").select('role')            (fixed to team_profiles)
--    1824:  .from("team_profiles").upsert({ ..., role, updated_at })
--    7545:  .from("team_profiles").select("id, email").in("role", [...])
--
--    Without `role`, the SLA-breach sweep could not resolve department leads, so
--    no lead was ever emailed, and upserting an operator profile failed with
--    42703. Phase 162 believed it had fixed lead notification; the filter was
--    still raising.
ALTER TABLE public.team_profiles
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'operator',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_team_profiles_department_role
    ON public.team_profiles (department, role);

-- 2. ticket_ai_telemetry annotation columns
ALTER TABLE public.ticket_ai_telemetry
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
    ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2b. hitl_audit_logs.action_required
--
--    4592: .from("hitl_audit_logs").update({ status, action_required })
--    6930: .from('hitl_audit_logs').insert({ ..., action_required })
--
--    Both raised 42703. The first is the HITL approve/reject path itself: the
--    update could not be written, `.single()` returned no row, and operator
--    approvals 409'd. The second silently discarded a paid-for failure analysis.
ALTER TABLE public.hitl_audit_logs
    ADD COLUMN IF NOT EXISTS action_required TEXT;

-- 3. memory_banks.author_id / tenant_id
--
--    7564: .from("memory_banks").select("author_id, created_at")
--    7834: .from("memory_banks").select(...).eq('tenant_id', tenantId)
--
--    The operator leaderboard attributable-contribution score was always 0
--    (the select raised), and every tenant read came back empty.
ALTER TABLE public.memory_banks
    ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memory_banks_tenant_created
    ON public.memory_banks (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_banks_author
    ON public.memory_banks (author_id);

-- 4. support_attachments
--
--    5707: supabase.from("support_attachments").insert({ ticket_id, file_name,
--          file_size, content_type, file_path })
--    7152: supabase.from('support_attachments').select('id, file_path')
--
--    No migration ever created this table. The upload path puts the bytes in the
--    `ticket_attachments` bucket and then tries to bind them to the ticket here,
--    so every attachment was orphaned in storage: the object existed, the row
--    that lists it never did, and the 90-day retention sweep had nothing to
--    iterate over and never deleted anything.
CREATE TABLE IF NOT EXISTS public.support_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    content_type TEXT,
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket
    ON public.support_attachments (ticket_id);

CREATE INDEX IF NOT EXISTS idx_support_attachments_created
    ON public.support_attachments (created_at);

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'support_attachments' AND policyname = 'Support staff can read attachments'
    ) THEN
        CREATE POLICY "Support staff can read attachments"
            ON public.support_attachments FOR SELECT
            USING (auth.jwt() ->> 'role' IN ('admin', 'support'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'support_attachments' AND policyname = 'Customers can read their own attachments'
    ) THEN
        CREATE POLICY "Customers can read their own attachments"
            ON public.support_attachments FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.support_tickets st
                    WHERE st.id = support_attachments.ticket_id
                      AND st.customer_id = auth.uid()
                )
            );
    END IF;
END $$;
