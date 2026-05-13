-- Migration: 20260705000000_sla_escalation.sql
-- Description: Autonomic SLA Escalation Cron Job

-- Ensure pg_cron extension exists (standard in AXiM Core, but good to check)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the escalation function
CREATE OR REPLACE FUNCTION escalate_breached_slas()
RETURNS void AS $$
DECLARE
    admin_user_id UUID;
    breached_ticket RECORD;
BEGIN
    -- Find an admin user to assign the escalated tickets
    -- Adjust the role check depending on how roles are stored in AXiM
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
    LIMIT 1;

    -- If no admin found, just take the first user as a fallback (for development)
    IF admin_user_id IS NULL THEN
        SELECT id INTO admin_user_id FROM auth.users LIMIT 1;
    END IF;

    -- Process all open tickets that have breached their SLA
    FOR breached_ticket IN
        SELECT id, subject FROM public.support_tickets
        WHERE status = 'open' AND sla_breach_at < NOW() AND priority != 'escalated'
    LOOP
        -- Reassign and mark as escalated
        UPDATE public.support_tickets
        SET priority = 'escalated',
            assigned_to = admin_user_id,
            updated_at = NOW()
        WHERE id = breached_ticket.id;

        -- Add an internal note to the ticket
        INSERT INTO public.ticket_messages (ticket_id, sender_id, message_body, is_internal_note)
        VALUES (
            breached_ticket.id,
            'onyx_system',
            'SYSTEM NOTE: Ticket SLA breached. Automatically escalated and reassigned to admin.',
            true
        );

        -- Emit event to AXiM Core events table
        INSERT INTO public.events_ax2024 (type, payload)
        VALUES (
            'urgent_escalation',
            json_build_object(
                'ticket_id', breached_ticket.id,
                'subject', breached_ticket.subject,
                'escalated_to', admin_user_id,
                'reason', 'SLA Breach'
            )
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job to run every 5 minutes
-- Need to drop if it exists to be safe
SELECT cron.unschedule('escalate-breached-slas');

SELECT cron.schedule(
    'escalate-breached-slas',
    '*/5 * * * *',
    'SELECT public.escalate_breached_slas();'
);

-- Unified Communication Pipeline Webhook

-- Function to handle webhook invocation
CREATE OR REPLACE FUNCTION notify_core_mailer()
RETURNS TRIGGER AS $$
DECLARE
    ticket_record RECORD;
    customer_email TEXT;
BEGIN
    -- Only send email if it's not an internal note and not from the customer themselves
    IF NEW.is_internal_note = false THEN
        -- Get ticket and customer info
        SELECT t.subject, t.customer_id INTO ticket_record
        FROM public.support_tickets t
        WHERE t.id = NEW.ticket_id;

        IF ticket_record IS NOT NULL THEN
            SELECT email INTO customer_email
            FROM public.contacts_ax2024
            WHERE id = ticket_record.customer_id;

            -- If customer email exists and sender is NOT the customer
            -- (Assuming customer UUIDs are not "onyx_system" or matching the sender_id)
            IF customer_email IS NOT NULL AND NEW.sender_id != ticket_record.customer_id::text THEN
                -- Invoke AXiM Core send-email Edge Function via pg_net
                -- In local dev / production, replace URL with actual edge function URL
                -- Note: Hardcoding a placeholder URL for the edge function.
                PERFORM net.http_post(
                    url := 'https://api.axim-core.internal/v1/functions/send-email',
                    body := json_build_object(
                        'to', customer_email,
                        'subject', 'Re: ' || ticket_record.subject,
                        'body', NEW.message_body,
                        'source', 'support_system'
                    )::jsonb,
                    headers := json_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || current_setting('app.settings.axim_service_key', true)
                    )::jsonb
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS ticket_message_insert_trigger ON public.ticket_messages;
CREATE TRIGGER ticket_message_insert_trigger
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION notify_core_mailer();
