ALTER TABLE public.contacts_ax2024 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to contacts" ON public.contacts_ax2024 FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.ticket_ai_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to telemetry" ON public.ticket_ai_telemetry FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.hitl_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to audit logs" ON public.hitl_audit_logs FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.events_ax2024 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to events" ON public.events_ax2024 FOR ALL USING (auth.role() = 'authenticated');
