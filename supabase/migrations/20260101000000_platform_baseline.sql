-- Phase 163: platform baseline so this migration chain can replay from empty.
--
-- `20260510000000_support_schema.sql` declares
--   customer_id UUID REFERENCES public.contacts_ax2024(id)
-- and `20261201000000_multi_tenant_isolation.sql` adds
--   organization_id UUID REFERENCES organizations(id)
-- but no migration in this repository creates either table. They belong to the
-- Core platform and are expected to be present already — which is true in
-- production and false on a fresh Supabase project, where `db reset` (or any
-- CI replay) dies on the first migration with
--   ERROR: relation "public.contacts_ax2024" does not exist
-- That is why nobody could add the migration-replay gate the phase-162 notes
-- asked for: the chain does not replay.
--
-- Everything here is `IF NOT EXISTS` and additive. On an existing project this
-- migration is a no-op. Columns are the union of what the worker actually
-- reads and writes (see `onyx-edge-worker/test/schema-drift.test.js`), so a
-- replayed database is shaped like the one the code expects.

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'Unassigned',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contacts_ax2024 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    name TEXT,
    -- 'customer' | 'lead' | ... ; the intake path inserts 'customer'.
    role TEXT DEFAULT 'customer',
    tags TEXT[] DEFAULT '{}',
    organization_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Intake resolves a customer by email (`resolveCustomerId`), so this lookup has
-- to be indexed and unique-ish. Not UNIQUE: existing rows may already collide,
-- and that is a data-cleanup decision rather than something a replay gate should
-- enforce.
CREATE INDEX IF NOT EXISTS idx_contacts_ax2024_email
    ON public.contacts_ax2024 (email);

CREATE INDEX IF NOT EXISTS idx_contacts_ax2024_organization
    ON public.contacts_ax2024 (organization_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts_ax2024 ENABLE ROW LEVEL SECURITY;

-- Service-role traffic only (the worker is the only writer); operators read
-- through the worker, never directly.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'contacts_ax2024' AND policyname = 'Allow service role full access to contacts'
    ) THEN
        CREATE POLICY "Allow service role full access to contacts"
            ON public.contacts_ax2024 FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'Allow service role full access to organizations'
    ) THEN
        CREATE POLICY "Allow service role full access to organizations"
            ON public.organizations FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
