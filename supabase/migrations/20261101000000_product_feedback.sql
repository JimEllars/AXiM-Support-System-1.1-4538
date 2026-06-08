-- Create product feedback table
CREATE TABLE IF NOT EXISTS public.product_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

-- Allow authenticated support agents to read feedback
CREATE POLICY "Agents can view product feedback"
ON public.product_feedback
FOR SELECT
TO authenticated
USING (true); -- Currently assuming any authenticated agent can read. More specific RLS can be added later if team profiles exist.

-- Service role has full access (Edge Worker needs to INSERT autonomously)
-- Service role bypasses RLS naturally, but for explicit clarity or if accessed via anon with signed keys, we can add a policy if needed.
-- Standard setup means service role does not need explicit policies, but let's add one just in case the edge worker uses a lesser role accidentally (though it uses service_role key).
CREATE POLICY "Service role full access on product feedback"
ON public.product_feedback
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
