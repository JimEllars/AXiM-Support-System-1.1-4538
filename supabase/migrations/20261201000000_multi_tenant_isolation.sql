-- Add organization_id
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE contacts_ax2024 ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE events_ax2024 ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Enable RLS Policies for Tenant Isolation
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant Isolation: Users can only view their organization's tickets"
ON support_tickets FOR SELECT
USING (organization_id = auth.jwt()->>'org_id'::uuid);
