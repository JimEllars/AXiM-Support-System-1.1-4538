-- Create ticket_attachments bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket_attachments', 'ticket_attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for ticket_attachments bucket
CREATE POLICY "Admins/Support can view all ticket attachments"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'ticket_attachments' AND
    auth.jwt() ->> 'role' IN ('admin', 'support')
);

CREATE POLICY "Users can view attachments for their tickets"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'ticket_attachments' AND
    EXISTS (
        SELECT 1 FROM public.support_tickets st
        WHERE st.id::text = (string_to_array(storage.objects.name, '/'))[1]
        AND st.customer_id = auth.uid()
    )
);

CREATE POLICY "Users can insert attachments for their tickets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'ticket_attachments' AND
    EXISTS (
        SELECT 1 FROM public.support_tickets st
        WHERE st.id::text = (string_to_array(storage.objects.name, '/'))[1]
        AND st.customer_id = auth.uid()
    )
);

CREATE POLICY "Admins/Support can insert ticket attachments"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'ticket_attachments' AND
    auth.jwt() ->> 'role' IN ('admin', 'support')
);
