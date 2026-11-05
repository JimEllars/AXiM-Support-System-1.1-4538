/**
 * Autonomy cron suites: SLA breach sweep and stale ticket sweep.
 *
 * Both are 15-minute crons whose failure mode is invisible in production — no
 * exception, no alert, just repeated work. The specific regressions pinned here
 * all shipped and stayed shipped:
 *
 *   * `handleSLASweep` ran two passes over the same breached rows. The first had
 *     no guard, so every run re-noted and re-emailed the same ticket forever.
 *     The second carried a `metadata.sla_breached` guard on a column that no
 *     migration created, so its update failed and the guard never took.
 *   * The 1-hour warning only fired when *both* EmailIt and Resend keys were
 *     set, which is the opposite of a failover chain.
 *   * `handleStaleTicketSweep` wrote a `ticket_stale_sweep` event that nothing
 *     consumed, so "stale" tickets were never escalated at all.
 *
 * The fake client below is stateful on purpose: the update issued by the first
 * sweep is visible to the second, which is the only way to prove idempotency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tickets: [],
  leads: [],
  inserts: [],
  updates: [],
  failUpdates: false,
}));

vi.mock('@supabase/supabase-js', () => {
  const makeChain = (table) => {
    const filters = {};
    let patch = null;

    const apply = () => {
      if (!patch) return;
      state.updates.push({ table, patch, filters });
      if (table === 'support_tickets' && filters.id) {
        const ticket = state.tickets.find((t) => t.id === filters.id);
        if (ticket) Object.assign(ticket, patch);
      }
    };

    const resolve = () => {
      if (patch) {
        if (state.failUpdates) {
          return { data: null, error: { message: 'column "metadata" does not exist' } };
        }
        apply();
        return { data: null, error: null };
      }
      if (table === 'support_tickets') {
        const now = new Date().toISOString();
        if (filters.lt && filters.lt[0] === 'sla_breach_at') {
          return { data: state.tickets.filter((t) => t.sla_breach_at && t.sla_breach_at < now), error: null };
        }
        if (filters.lt && filters.lt[0] === 'updated_at') {
          return { data: state.tickets.filter((t) => t.updated_at && t.updated_at < filters.lt[1]), error: null };
        }
        if (filters.gt && filters.gt[0] === 'sla_breach_at') {
          return { data: [], error: null };
        }
        return { data: [], error: null };
      }
      if (table === 'team_profiles') return { data: state.leads, error: null };
      return { data: null, error: null };
    };

    const query = {
      select: () => query,
      insert: (rows) => {
        state.inserts.push({ table, rows });
        return query;
      },
      update: (p) => {
        patch = p;
        return query;
      },
      upsert: () => query,
      delete: () => query,
      eq: (col, val) => {
        filters[col] = val;
        return query;
      },
      neq: () => query,
      in: (col, val) => {
        filters.in = [col, val];
        return query;
      },
      lt: (col, val) => {
        filters.lt = [col, val];
        return query;
      },
      gt: (col, val) => {
        filters.gt = [col, val];
        return query;
      },
      lte: (col, val) => {
        filters.lte = [col, val];
        return query;
      },
      order: () => query,
      limit: () => query,
      single: () => Promise.resolve(resolve()),
      maybeSingle: () => Promise.resolve(resolve()),
      then: (onFulfilled, onRejected) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return query;
  };

  return {
    createClient: () => ({
      from: makeChain,
      rpc: () => makeChain('rpc'),
      auth: { getUser: async () => ({ data: { user: { id: 'op-1' } }, error: null }) },
    }),
  };
});

// Static import (hoisted above `vi.mock`, like the trust-boundary suite).
import { handleSLASweep, handleStaleTicketSweep } from '../src/index.ts';

const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  AXIM_INTERNAL_KEY: 'internal-key',
};

const honoured = () => ({ waitUntil: (p) => p });

const messages = () => state.inserts.filter((i) => i.table === 'ticket_messages').map((i) => i.rows);
const events = (type) =>
  state.inserts
    .filter((i) => i.table === 'events_ax2024')
    .map((i) => i.rows)
    .filter((r) => r && r.type === type);

function breachedTicket(overrides = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    subject: 'Robot arm controller offline',
    priority: 'high',
    status: 'open',
    assigned_department: 'Robotics',
    sla_breach_at: new Date(Date.now() - 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 1000).toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe('handleSLASweep', () => {
  beforeEach(() => {
    state.tickets = [];
    state.leads = [{ email: 'robotics-lead@axim.us.com', role: 'lead' }];
    state.inserts = [];
    state.updates = [];
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }));
  });

  it('escalates a breached ticket exactly once, then stands down on the next run', async () => {
    state.tickets = [breachedTicket()];

    await handleSLASweep({ ...baseEnv, EMAILIT_API_KEY: 'e', RESEND_API_KEY: 'r' }, honoured());
    await handleSLASweep({ ...baseEnv, EMAILIT_API_KEY: 'e', RESEND_API_KEY: 'r' }, honoured());

    const notes = messages().filter((m) => String(m.message_body).includes('AUTONOMOUS SLA ESCALATION'));
    expect(notes).toHaveLength(1);
    expect(events('sla_breach_auto_escalated')).toHaveLength(1);

    expect(state.tickets[0].priority).toBe('urgent');
    expect(state.tickets[0].metadata.sla_breached).toBe(true);
  });

  it('routes escalation to the department leads and records them in the audit event', async () => {
    state.tickets = [breachedTicket()];

    await handleSLASweep({ ...baseEnv, RESEND_API_KEY: 'r' }, honoured());

    const [event] = events('sla_breach_auto_escalated');
    expect(event.payload.notified_leads).toEqual(['robotics-lead@axim.us.com']);
    expect(event.payload.department).toBe('Robotics');
  });

  it('still notifies when only Resend is configured', async () => {
    state.tickets = [breachedTicket()];
    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
    });

    await handleSLASweep({ ...baseEnv, RESEND_API_KEY: 'r' }, honoured());

    expect(calls.some((c) => c.includes('resend.com'))).toBe(true);
    expect(calls.some((c) => c.includes('emailit'))).toBe(false);
  });

  it('does not write the escalation note when the flag cannot be persisted', async () => {
    // A ticket whose guard update fails must not be noted: that loop is what
    // produced unbounded duplicate notes when `metadata` did not exist on the
    // table, because the flag could never be persisted and every run escalated
    // the ticket again.
    state.tickets = [breachedTicket()];
    state.failUpdates = true;
    await handleSLASweep({ ...baseEnv, RESEND_API_KEY: 'r' }, honoured());
    state.failUpdates = false;

    expect(messages()).toHaveLength(0);
    expect(events('sla_breach_auto_escalated')).toHaveLength(0);
  });
});

describe('handleStaleTicketSweep', () => {
  beforeEach(() => {
    state.tickets = [];
    state.leads = [];
    state.inserts = [];
    state.updates = [];
  });

  it('escalates a stale ticket once and posts a single internal note', async () => {
    state.tickets = [
      { ...breachedTicket(), id: 't-stale-1', priority: 'low', updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ];

    const first = await handleStaleTicketSweep({ ...baseEnv });
    const second = await handleStaleTicketSweep({ ...baseEnv });

    expect(first).toBe(1);
    expect(second).toBe(0);

    const notes = messages().filter((m) => String(m.message_body).includes('STALE TICKET ESCALATION'));
    expect(notes).toHaveLength(1);
    expect(notes[0].is_internal_note).toBe(true);
    expect(state.tickets[0].priority).toBe('high');
    expect(state.tickets[0].metadata.stale_escalated_at).toBeTruthy();
    expect(events('ticket_stale_sweep')).toHaveLength(1);
  });

  it('leaves an already urgent ticket urgent', async () => {
    state.tickets = [
      { ...breachedTicket(), id: 't-stale-2', priority: 'urgent', updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ];

    await handleStaleTicketSweep({ ...baseEnv });

    expect(state.tickets[0].priority).toBe('urgent');
  });
});
