import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailDispatchManager } from '../src/email/dispatch';

describe('EmailDispatchManager', () => {
  let dispatchManager;
  const mockEmailitKey = 'test_emailit_key';
  const mockResendKey = 'test_resend_key';
  const defaultFrom = 'AXiM Support <support@updates.axim.io>';

  beforeEach(() => {
    dispatchManager = new EmailDispatchManager(mockEmailitKey, mockResendKey, defaultFrom);
    global.fetch = vi.fn();
  });

  it('Primary Path: Successful send via EmailIt API v2 with mocked HTTP 200 and telemetry header extraction', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'ratelimit-remaining': '9',
        'ratelimit-daily-remaining': '4999',
        'ratelimit-daily-reset': '3600'
      }),
      json: async () => ({ id: 'emailit_msg_1' })
    });

    const result = await dispatchManager.send({ to: 'test@example.com', subject: 'Test' });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('emailit');
    expect(result.messageId).toBe('emailit_msg_1');
    expect(dispatchManager.getTelemetry()).toEqual({
      rateLimitRemaining: 9,
      dailyRemaining: 4999,
      dailyResetSeconds: 3600
    });
  });

  it('Failover Path (Timeout or 500): Trigger fallback to Resend', async () => {
    // Mock EmailIt to fail
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: 'Internal Server Error' })
    });

    // Mock Resend to succeed
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'resend_msg_1' })
    });

    const result = await dispatchManager.send({ to: 'test@example.com', subject: 'Failover Test', meta: { key: 'val' } });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('resend');
    expect(result.messageId).toBe('resend_msg_1');

    // Check if fetch was called with Resend endpoint on second try
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('resend.com');
  });

  it('Failover Path (Quota Exhaustion): Route to Resend directly when daily quota is 0', async () => {
    // Setup state where daily remaining is 0
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'ratelimit-remaining': '9',
        'ratelimit-daily-remaining': '0',
        'ratelimit-daily-reset': '3600'
      }),
      json: async () => ({ id: 'emailit_msg_1' })
    });

    await dispatchManager.send({ to: 'test1@example.com', subject: 'Exhaust Quota' });

    // Next call should go straight to Resend
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'resend_msg_2' })
    });

    const result2 = await dispatchManager.send({ to: 'test2@example.com', subject: 'Direct Resend' });
    expect(result2.provider).toBe('resend');

    // 1 call to EmailIt (first time), 1 call to Resend (second time)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('resend.com');
  });

  it('Circuit Breaker: Should trip open on error and route to Resend for 5 minutes', async () => {
    // First call fails
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: 'Error' })
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'resend_msg_1' })
    });

    await dispatchManager.send({ to: 'test1@example.com', subject: 'Error Trigger' });

    // Second call should go straight to Resend
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 'resend_msg_2' })
    });
    const result2 = await dispatchManager.send({ to: 'test2@example.com', subject: 'Circuit Open Test' });

    expect(result2.provider).toBe('resend');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toContain('resend.com');
  });

  it('Webhook Verification: Verify X-Emailit-Signature', async () => {
    const rawBody = JSON.stringify({ message: 'test' });
    const secret = 'supersecret';

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const t = Math.floor(Date.now() / 1000).toString();
    const dataToSign = encoder.encode(t + '.' + rawBody);
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, dataToSign);
    const signatureHex = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const signatureHeader = `t=${t},v1=${signatureHex}`;

    const isValid = await EmailDispatchManager.verifyEmailItSignature(rawBody, signatureHeader, secret);
    expect(isValid).toBe(true);

    const isInvalid = await EmailDispatchManager.verifyEmailItSignature(rawBody, 't=123,v1=badhex', secret);
    expect(isInvalid).toBe(false);
  });
});
