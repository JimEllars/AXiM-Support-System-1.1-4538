-- Phase 162: repair the pg_cron SLA safety net.
--
-- `escalate_breached_slas()` has raised on every single run since it was
-- created in 20260705000000_sla_escalation.sql, five minutes at a time:
--
--   * `priority != 'escalated'` — 'escalated' is not a member of the
--     `ticket_priority` enum (low | medium | high | urgent), so the comparison
--     itself raises "invalid input value for enum ticket_priority".
--   * `assigned_to = ...` — the column is `assignee_id`.
--
-- A raising function means the loop body never executed: nothing was ever
-- reassigned, no note was added and no `urgent_escalation` event was written.
--
-- The Worker's `handleSLASweep` (every 15 minutes) is the primary escalation
-- path and sets `priority = 'urgent'`. This job stays as the database-side
-- safety net for the window after a Worker failure, and skips anything already
-- urgent so the two paths cannot double-note the same ticket.
CREATE OR REPLACE FUNCTION public.escalate_breached_slas()
RETURNS void AS $$
DECLARE
    admin_user_id UUID;
    breached_ticket RECORD;
BEGIN
    -- Find an admin to fall back to when a ticket has no assignee.
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
    LIMIT 1;

    IF admin_user_id IS NULL THEN
        SELECT id INTO admin_user_id FROM auth.users LIMIT 1;
    END IF;

    FOR breached_ticket IN
        SELECT id, subject
        FROM public.support_tickets
        WHERE status IN ('open', 'pending')
          AND sla_breach_at IS NOT NULL
          AND sla_breach_at < NOW()
          AND priority <> 'urgent'
    LOOP
        UPDATE public.support_tickets
        SET priority = 'urgent',
            assignee_id = COALESCE(assignee_id, admin_user_id),
            updated_at = NOW()
        WHERE id = breached_ticket.id;

        INSERT INTO public.ticket_messages (ticket_id, sender_id, message_body, is_internal_note)
        VALUES (
            breached_ticket.id,
            'onyx_system',
            'SYSTEM NOTE: Ticket SLA breached. Automatically escalated to urgent by the database safety net.',
            true
        );

        INSERT INTO public.events_ax2024 (type, payload)
        VALUES (
            'sla_breach_auto_escalated',
            json_build_object(
                'ticket_id', breached_ticket.id,
                'subject', breached_ticket.subject,
                'escalated_to', admin_user_id,
                'reason', 'SLA Breach',
                'source', 'pg_cron_safety_net'
            )
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;
