/**
 * EmailDispatchManager failover behaviour.
 *
 * Both properties here were broken in a way that unit-testing the happy path
 * would never have caught: the circuit breaker lived on the instance (so it
 * reset on every dispatch and never opened), and the inbound webhook signature
 * compared with `===` and ignored the timestamp it parsed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailDispatchManager } from '../src/email/dispatch.ts';

async function sign(secret, timestamp, body) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('EmailDispatchManager provider failover', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    EmailDispatchManager.resetProviderHealthForTests();
  });

  it('opens the breaker so the next dispatch manager skips the failing provider', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      if (String(url).includes('emailit')) {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      }
      return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
    });

    const first = new EmailDispatchManager('emailit-key', 'resend-key', 'ops@axim.us.com');
    const firstResult = await first.send({ to: 'customer@example.com', subject: 'a', html: '<p>a</p>' });
    expect(firstResult.success).toBe(true);
    expect(firstResult.provider).toBe('resend');
    expect(calls.filter((c) => c.includes('emailit'))).toHaveLength(1);

    // A brand new manager (as a fresh handler would create) must inherit the
    // cooldown instead of re-probing EmailIt.
    const second = new EmailDispatchManager('emailit-key', 'resend-key', 'ops@axim.us.com');
    const secondResult = await second.send({ to: 'customer@example.com', subject: 'b', html: '<p>b</p>' });

    expect(secondResult.success).toBe(true);
    expect(secondResult.provider).toBe('resend');
    expect(calls.filter((c) => c.includes('emailit'))).toHaveLength(1);
  });

  it('prefers EmailIt when it is healthy', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (String(url).includes('emailit')) {
        return new Response(JSON.stringify({ id: 'emailit-1' }), {
          status: 200,
          headers: { 'ratelimit-daily-remaining': '500' },
        });
      }
      return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 });
    });

    const manager = new EmailDispatchManager('emailit-key', 'resend-key', 'ops@axim.us.com');
    const result = await manager.send({ to: 'customer@example.com', subject: 'c', html: '<p>c</p>' });
    expect(result.provider).toBe('emailit');
  });
});

describe('EmailIt webhook signature verification', () => {
  const secret = 'emailit-webhook-secret';
  const body = JSON.stringify({ event: 'email.delivered', id: 'msg-1' });
  beforeEach(() => {
    EmailDispatchManager.resetProviderHealthForTests();
  });

  it('accepts a fresh signature', async () => {
    const header = await sign(secret, nowSeconds(), body);
    await expect(EmailDispatchManager.verifyEmailItSignature(body, header, secret)).resolves.toBe(true);
  });

  it('rejects a captured signature replayed outside the window', async () => {
    const header = await sign(secret, nowSeconds() - 3600, body);
    await expect(EmailDispatchManager.verifyEmailItSignature(body, header, secret)).resolves.toBe(false);
  });

  it('rejects a tampered body', async () => {
    const header = await sign(secret, nowSeconds(), body);
    await expect(
      EmailDispatchManager.verifyEmailItSignature(body.replace('msg-1', 'msg-2'), header, secret)
    ).resolves.toBe(false);
  });

  it('rejects a signature computed with a different secret', async () => {
    const header = await sign('other-secret', nowSeconds(), body);
    await expect(EmailDispatchManager.verifyEmailItSignature(body, header, secret)).resolves.toBe(false);
  });
});
