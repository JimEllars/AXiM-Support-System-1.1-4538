-- Phase 162: columns the edge worker writes that no migration ever created.
--
-- Every item below is written by `onyx-edge-worker/src/index.ts` (or read back
-- by the dashboard) and was missing from the migration chain, so the statement
-- carrying it failed at runtime and the failure was swallowed by the caller.
-- `IF NOT EXISTS` keeps this a no-op on an environment that already has them.
--
--   support_tickets.metadata            SLA flags (sla_breached / sla_warning /
--                                       stale_escalated_at), the robotics flight
--                                       recorder payload, chatbase conversation
--                                       ids, duplicate-detection pointers.
--                                       `20261401000000_ingress_performance_indexes.sql`
--                                       already builds an index on
--                                       `metadata->>'chatbase_conversation_id'`,
--                                       so that migration could never have applied.
--   support_tickets.resolved_at         written by `resolve-from-coder`.
--   support_tickets.category            written by `robotics/fault-ingest`.
--   hitl_audit_logs.metadata            written by the executive email bridge.
--   product_feedback.comments           was inserted as `comment` (wrong name).
--   product_feedback.sentiment          AI sentiment score from the CSAT handler.
--   product_feedback.customer_email     respondent address from the CSAT handler.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.hitl_audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_feedback
  ADD COLUMN IF NOT EXISTS sentiment TEXT;

ALTER TABLE public.product_feedback
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- `POST /api/v1/tickets/:id/coder-patch` moves a ticket to
-- "Review-Patch-Pending" and `SLABadge.jsx` renders a dedicated state for it,
-- but the value was never added to the enum, so the update raised
-- "invalid input value for enum ticket_status" and the Coding Lab callback
-- failed at its first step. PostgreSQL 12+ allows ADD VALUE outside of the
-- statement that uses it, which is the case here.
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'Review-Patch-Pending';
