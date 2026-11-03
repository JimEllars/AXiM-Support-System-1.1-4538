import { describe, it, expect } from 'vitest';
import { sanitizePayload } from './sanitize';

/**
 * Phase 160 — `sanitizePayload` feeds `dangerouslySetInnerHTML` in
 * `RCADocumentBlock`, so its escaping behaviour is the only thing between an
 * operator's RCA notes and raw HTML. These cases pin the current contract
 * (angle brackets become entities, other keys recurse, non-objects pass
 * through) so a future "tidy up" cannot silently drop the escaping.
 */
describe('sanitizePayload', () => {
  it('escapes angle brackets so tags cannot be interpreted', () => {
    const out = sanitizePayload({ html: '<img src=x onerror=alert(1)>' });
    expect(out.html).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(out.html).not.toContain('<');
  });

  it('escapes script tags in nested structures', () => {
    const out = sanitizePayload({ a: { b: ['<script>', 'safe'] } });
    expect(out.a.b[0]).toBe('&lt;script&gt;');
    expect(out.a.b[1]).toBe('safe');
  });

  it('preserves non-string primitives', () => {
    const out = sanitizePayload({ n: 42, t: true, z: null });
    expect(out).toEqual({ n: 42, t: true, z: null });
  });

  it('returns non-object input untouched', () => {
    expect(sanitizePayload('plain')).toBe('plain');
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeUndefined();
  });

  it('does not mutate the caller payload', () => {
    const input = { html: '<b>bold</b>' };
    sanitizePayload(input);
    expect(input.html).toBe('<b>bold</b>');
  });
});
