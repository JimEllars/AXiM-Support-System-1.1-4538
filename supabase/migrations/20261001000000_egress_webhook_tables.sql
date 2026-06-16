-- Missing webhook table based on instructions
CREATE TABLE IF NOT EXISTS public.tenant_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    url TEXT NOT NULL,
    secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
