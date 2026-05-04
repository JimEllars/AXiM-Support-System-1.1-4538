-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Enums for Support Tickets
CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- 1. Support Tickets Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status ticket_status DEFAULT 'open',
    priority ticket_priority DEFAULT 'medium',
    customer_id UUID REFERENCES public.contacts_ax2024(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ticket Messages Table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL, -- Can be auth.users or contacts_ax2024
    message_body TEXT NOT NULL,
    is_internal_note BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ticket AI Telemetry Table (Onyx AI Data)
CREATE TABLE IF NOT EXISTS public.ticket_ai_telemetry (
    ticket_id UUID PRIMARY KEY REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    analyzed_sentiment TEXT,
    suggested_category TEXT,
    auto_response_draft TEXT,
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) Setup
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_telemetry ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Support Tickets
-- Admins/Support can view all tickets
CREATE POLICY "Support and Admins can view all tickets" 
ON public.support_tickets FOR SELECT 
USING (
  auth.jwt() ->> 'role' IN ('admin', 'support')
);

-- Users can view their own tickets
CREATE POLICY "Users can view their own tickets" 
ON public.support_tickets FOR SELECT 
USING (
  customer_id = auth.uid()
);

-- Users can insert their own tickets
CREATE POLICY "Users can create tickets" 
ON public.support_tickets FOR INSERT 
WITH CHECK (
  customer_id = auth.uid()
);

-- RLS Policies: Ticket Messages
CREATE POLICY "Users can view messages for their tickets" 
ON public.ticket_messages FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE support_tickets.id = ticket_messages.ticket_id 
    AND support_tickets.customer_id = auth.uid()
  ) AND is_internal_note = FALSE
);

CREATE POLICY "Support can view all messages" 
ON public.ticket_messages FOR SELECT 
USING (
  auth.jwt() ->> 'role' IN ('admin', 'support')
);

-- RLS Policies: AI Telemetry
-- Only internal staff can see AI operations
CREATE POLICY "Only Support and Admins can view AI telemetry" 
ON public.ticket_ai_telemetry FOR SELECT 
USING (
  auth.jwt() ->> 'role' IN ('admin', 'support')
);

-- Trigger for updated_at on support_tickets
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_support_tickets_modtime
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();