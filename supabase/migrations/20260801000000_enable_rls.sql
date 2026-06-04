-- Enable RLS on core operational tables
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Create policies allowing authenticated operators full access
CREATE POLICY "Allow authenticated full access to support_tickets"
ON public.support_tickets
FOR ALL
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated full access to ticket_messages"
ON public.ticket_messages
FOR ALL
USING (auth.role() = 'authenticated');

-- Note: The Edge Worker (using SUPABASE_SERVICE_ROLE_KEY) inherently bypasses these RLS rules
-- preserving external webhook functionality while locking down the UI.
