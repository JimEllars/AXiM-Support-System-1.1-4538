-- HTTP extension is needed if we call edge functions from DB, but usually pg_net is better.
-- Let's create a webhook trigger using Supabase pg_net or standard edge function invoke if preferred.
-- However, we can also just create a simple function and trigger that uses the 'http' extension
-- OR use a generic DB webhook in the UI. For this standard, we'll assume a DB Webhook is configured in the Supabase Dashboard.
-- We will just provide the Edge Worker code to handle the webhook.

-- Let's define the RCA status to track if RCA was generated.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS rca_generated BOOLEAN DEFAULT FALSE;
