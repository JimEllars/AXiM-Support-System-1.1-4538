/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SLABadge from './SLABadge';

/**
 * Phase 160 — first real component coverage in the frontend suite.
 *
 * The SLA badge is where the pre-breach text shown to operators comes from, and
 * the threshold ladder below is easy to get wrong in a refactor. Timers are
 * faked so the absolute labels are deterministic.
 */

const NOW = new Date('2026-11-03T10:00:00Z');

function renderAt(breachAt, props = {}) {
  return render(<SLABadge breachAt={breachAt} status="open" {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SLABadge', () => {
  it('renders nothing when there is no breach timestamp', () => {
    const { container } = render(<SLABadge status="open" />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing once the ticket is resolved or closed', () => {
    const breachAt = '2026-11-03T12:00:00Z';
    const { container: resolved } = renderAt(breachAt, { status: 'resolved' });
    expect(resolved.textContent).toBe('');
    cleanup();
    const { container: closed } = renderAt(breachAt, { status: 'closed' });
    expect(closed.textContent).toBe('');
  });

  it('shows BREACHED once the deadline has passed', () => {
    renderAt('2026-11-03T09:00:00Z');
    expect(screen.getByRole('status').textContent).toContain('BREACHED');
  });

  it('counts down in hours and minutes when more than two hours remain', () => {
    renderAt('2026-11-03T13:30:00Z');
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('3h 30m left');
    expect(badge.textContent).not.toContain('BREACHED');
  });

  it('escalates to the warning treatment inside the final two hours', () => {
    renderAt('2026-11-03T11:45:00Z');
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('1h 45m left');
    expect(badge.className).toContain('animate-pulse');
  });

  it('prefers the explicit sla_warning metadata flag over the countdown', () => {
    renderAt('2026-11-03T13:00:00Z', { metadata: { sla_warning: true } });
    expect(screen.getByRole('status').textContent).toContain('SLA WARNING');
  });

  it('shows the patch-review state for Review-Patch-Pending regardless of the clock', () => {
    renderAt('2026-11-03T09:00:00Z', { status: 'Review-Patch-Pending' });
    expect(screen.getByRole('status').textContent).toContain('PATCH REVIEW PENDING');
  });
});
