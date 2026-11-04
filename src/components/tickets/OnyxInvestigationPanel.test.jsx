/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Phase 161 — the Robotics flight recorder HUD used to render three hard-coded
 * strings ("DIVERGENCE DETECTED", "ELEVATED", "YES") for any ticket whose
 * telemetry category was `Robotics / Hardware Fault`, while never reading the
 * `support_tickets.metadata.flight_recorder_data` payload that
 * `/api/v1/robotics/fault-ingest` actually writes. Operators were reading
 * fiction on urgent hardware tickets.
 *
 * These cases pin the honest behaviour: the panel shows the readings it
 * received, and says so when it received none.
 */

const hoisted = vi.hoisted(() => ({
  telemetry: null,
  ticketMetadata: null,
  briefingEvent: null,
}));

vi.mock('../../lib/supabaseClient', () => {
  const makeQuery = (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => {
        if (table === 'ticket_ai_telemetry') return Promise.resolve({ data: hoisted.telemetry });
        if (table === 'support_tickets') return Promise.resolve({ data: { metadata: hoisted.ticketMetadata } });
        if (table === 'events_ax2024') return Promise.resolve({ data: hoisted.briefingEvent });
        return Promise.resolve({ data: null });
      },
    };
    return query;
  };

  return { supabase: { from: (table) => makeQuery(table) } };
});

import OnyxInvestigationPanel from './OnyxInvestigationPanel';

const ROBOTICS_CATEGORY = 'Robotics / Hardware Fault';

beforeEach(() => {
  hoisted.telemetry = { ticket_id: 't-1', category: ROBOTICS_CATEGORY, sentiment: 'negative', confidence: 91 };
  hoisted.ticketMetadata = null;
  hoisted.briefingEvent = null;
  cleanup();
});

describe('OnyxInvestigationPanel robotics HUD', () => {
  it('renders the flight recorder readings that were actually ingested', async () => {
    hoisted.ticketMetadata = {
      node_id: 'AXM-NODE-77',
      is_robotics: true,
      flight_recorder_data: {
        pitch_deg: -14.2,
        roll_deg: 3.1,
        current_a: 41.8,
        estop: true,
      },
    };

    render(<OnyxInvestigationPanel ticketId="t-1" />);

    expect(await screen.findByText(/Robotics Flight Recorder HUD/i)).toBeTruthy();
    expect(await screen.findByText('AXM-NODE-77')).toBeTruthy();
    expect(await screen.findByText('pitch_deg')).toBeTruthy();
    expect(screen.getByText('-14.2')).toBeTruthy();
    expect(screen.getByText('41.8')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('does not fabricate readings when no flight recorder payload exists', async () => {
    hoisted.ticketMetadata = { node_id: 'AXM-NODE-77', is_robotics: true };

    render(<OnyxInvestigationPanel ticketId="t-1" />);

    expect(await screen.findByText(/Robotics Flight Recorder HUD/i)).toBeTruthy();
    expect(screen.getByText(/No flight recorder payload ingested/i)).toBeTruthy();
    expect(screen.queryByText(/DIVERGENCE DETECTED/i)).toBeNull();
    expect(screen.queryByText(/ELEVATED/i)).toBeNull();
  });

  it('stays quiet on tickets that are not robotics faults', async () => {
    hoisted.telemetry = { ticket_id: 't-1', category: 'Billing', sentiment: 'neutral' };
    hoisted.ticketMetadata = {};

    render(<OnyxInvestigationPanel ticketId="t-1" />);

    expect(await screen.findByText(/Onyx Edge Neural Investigation/i)).toBeTruthy();
    expect(screen.queryByText(/Robotics Flight Recorder HUD/i)).toBeNull();
  });

  it('escapes recorder values instead of injecting markup', async () => {
    hoisted.ticketMetadata = {
      is_robotics: true,
      flight_recorder_data: { fault_code: '<b>ESTOP</b>' },
    };

    const { container } = render(<OnyxInvestigationPanel ticketId="t-1" />);

    expect(await screen.findByText(/fault_code/i)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('&lt;b&gt;ESTOP&lt;/b&gt;')).toBeTruthy();
  });
});
