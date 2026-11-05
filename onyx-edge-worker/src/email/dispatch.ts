export interface EmailAttachment {
  filename: string;
  content?: string;
  url?: string;
  content_type?: string;
  content_id?: string;
}

export interface EmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  template?: string;
  variables?: Record<string, any>;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  meta?: Record<string, string>;
  idempotencyKey?: string;
}

export interface DispatchResult {
  success: boolean;
  provider: 'emailit' | 'resend';
  messageId?: string;
  rawResponse?: any;
  error?: string;
}

export interface EmailItTelemetry {
  rateLimitRemaining: number;
  dailyRemaining: number;
  dailyResetSeconds: number;
}

/**
 * Provider-health state lives outside the instance.
 *
 * Every handler builds its own `new EmailDispatchManager(...)`, so a breaker
 * held on `this` reset on the next dispatch and never opened once — EmailIt
 * was re-probed on every single send during an outage. Module scope keeps the
 * cooldown alive for the lifetime of the isolate, which is what a circuit
 * breaker is for.
 */
interface BreakerState {
  isOpen: boolean;
  cooldownUntil: number;
  telemetry: EmailItTelemetry | null;
}

const SHARED_BREAKER: BreakerState = { isOpen: false, cooldownUntil: 0, telemetry: null };

/** Inbound EmailIt webhook signatures are only accepted inside this window. */
export const EMAILIT_SIGNATURE_MAX_SKEW_SECONDS = 300;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class EmailDispatchManager {
  private emailitApiKey: string;
  private resendApiKey: string;
  private defaultFromEmail: string;
  private primaryBaseUrl = 'https://api.emailit.com/v2';
  private secondaryBaseUrl = 'https://api.resend.com';

  private isCircuitOpen = false;
  private circuitCooldownUntil = 0;
  private latestTelemetry: EmailItTelemetry | null = null;

  constructor(emailitApiKey: string, resendApiKey: string, defaultFromEmail?: string) {
    this.emailitApiKey = emailitApiKey;
    this.resendApiKey = resendApiKey;
    this.defaultFromEmail = defaultFromEmail || "AXiM Support <support@updates.axim.io>";
  }

  public async send(options: EmailOptions): Promise<DispatchResult> {
    const now = Date.now();
    if (!options.from) options.from = this.defaultFromEmail;

    // Phase 162: an unconfigured provider used to be *probed* with
    // `Authorization: Bearer undefined`. That request always 401s, which tripped
    // the shared breaker for five minutes and sent every subsequent message to
    // Resend, and made the failure look like an EmailIt outage instead of a
    // missing binding. Route around a provider we know we cannot use.
    if (!this.emailitApiKey) {
      return this.sendViaResend(options, 'EmailIt API key not configured');
    }

    // Adopt any health state accumulated by other dispatch managers.
    this.isCircuitOpen = SHARED_BREAKER.isOpen;
    this.circuitCooldownUntil = SHARED_BREAKER.cooldownUntil;
    this.latestTelemetry = SHARED_BREAKER.telemetry;

    if (this.isCircuitOpen) {
      if (now > this.circuitCooldownUntil) {
        this.isCircuitOpen = false;
        SHARED_BREAKER.isOpen = false;
        SHARED_BREAKER.cooldownUntil = 0;
      } else {
        return this.sendViaResend(options, 'Circuit breaker active for EmailIt');
      }
    }

    if (this.latestTelemetry && this.latestTelemetry.dailyRemaining <= 0) {
      return this.sendViaResend(options, 'EmailIt daily sending quota exhausted');
    }

    try {
      return await this.sendViaEmailIt(options);
    } catch (error: any) {
      this.tripCircuitBreaker(5 * 60 * 1000); // 5 minutes
      return await this.sendViaResend(options, error.message);
    }
  }

  private async sendViaEmailIt(options: EmailOptions): Promise<DispatchResult> {
    const endpoint = `${this.primaryBaseUrl}/emails`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.emailitApiKey}`,
      'Content-Type': 'application/json'
    };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const payload = {
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.reply_to,
      cc: options.cc,
      bcc: options.bcc,
      template: options.template,
      variables: options.variables,
      attachments: options.attachments,
      headers: options.headers,
      meta: options.meta
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      this.extractTelemetryHeaders(response);

      if (response.status === 429) {
        throw new Error('EmailIt Rate Limit Exceeded (HTTP 429)');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status >= 500 || response.status === 403 || response.status === 429) {
          throw new Error(`EmailIt API Error [HTTP ${response.status}]: ${JSON.stringify(errorData)}`);
        }

        return {
          success: false,
          provider: 'emailit',
          error: `EmailIt API Error [HTTP ${response.status}]: ${JSON.stringify(errorData)}`
        };
      }

      const data: any = await response.json();
      return {
        success: true,
        provider: 'emailit',
        messageId: data.id,
        rawResponse: data
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendViaResend(options: EmailOptions, reason: string): Promise<DispatchResult> {
    if (!this.resendApiKey) {
      return {
        success: false,
        provider: 'resend',
        error: `No email provider is configured (EmailIt skipped: ${reason})`
      };
    }

    const endpoint = `${this.secondaryBaseUrl}/emails`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.resendApiKey}`,
      'Content-Type': 'application/json'
    };

    if (options.idempotencyKey) {
      headers['X-Idempotency-Key'] = options.idempotencyKey;
    }

    const processedAttachments = await this.resolveAttachmentsForResend(options.attachments);

    const payload: Record<string, any> = {
      from: options.from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : undefined,
      reply_to: options.reply_to ? (Array.isArray(options.reply_to) ? options.reply_to : [options.reply_to]) : undefined,
      headers: options.headers,
      attachments: processedAttachments
    };

    if (options.meta) {
      payload.tags = Object.entries(options.meta).map(([name, value]) => ({ name, value: String(value) }));
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        success: false,
        provider: 'resend',
        error: `Critical Secondary Provider Failure (Resend) [HTTP ${response.status}]: ${JSON.stringify(errorBody)}`
      };
    }

    const data: any = await response.json();
    return {
      success: true,
      provider: 'resend',
      messageId: data.id,
      rawResponse: data
    };
  }

  private extractTelemetryHeaders(response: Response): void {
    const remaining = response.headers.get('ratelimit-remaining');
    const dailyRemaining = response.headers.get('ratelimit-daily-remaining');
    const dailyReset = response.headers.get('ratelimit-daily-reset');

    if (dailyRemaining !== null) {
      this.latestTelemetry = {
        rateLimitRemaining: remaining ? parseInt(remaining, 10) : 0,
        dailyRemaining: parseInt(dailyRemaining, 10),
        dailyResetSeconds: dailyReset ? parseInt(dailyReset, 10) : 0
      };
      SHARED_BREAKER.telemetry = this.latestTelemetry;
    }
  }

  private async resolveAttachmentsForResend(attachments?: EmailAttachment[]): Promise<any[] | undefined> {
    if (!attachments || attachments.length === 0) return undefined;

    const resolved = [];
    for (const att of attachments) {
      if (att.content) {
        resolved.push({ filename: att.filename, content: att.content });
      } else if (att.url) {
        try {
          const res = await fetch(att.url);
          const arrayBuffer = await res.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          resolved.push({ filename: att.filename, content: base64 });
        } catch (err) {
          console.warn(`Failed to resolve attachment URL for Resend: ${att.url}`);
        }
      }
    }
    return resolved;
  }

  /**
   * Test-only hook: provider health is module-scoped (that is the fix), so
   * suites that assume a cold breaker need a way to clear it between cases.
   */
  public static resetProviderHealthForTests(): void {
    SHARED_BREAKER.isOpen = false;
    SHARED_BREAKER.cooldownUntil = 0;
    SHARED_BREAKER.telemetry = null;
  }

  private tripCircuitBreaker(durationMs: number): void {
    this.isCircuitOpen = true;
    this.circuitCooldownUntil = Date.now() + durationMs;
    SHARED_BREAKER.isOpen = true;
    SHARED_BREAKER.cooldownUntil = this.circuitCooldownUntil;
  }

  public getTelemetry(): EmailItTelemetry | null {
    return this.latestTelemetry;
  }

  public static async verifyEmailItSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
    try {
      if (!signatureHeader || !secret) return false;

      const parts = signatureHeader.split(',');
      let t = '', v1 = '';
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith('t=')) t = trimmed.substring(2);
        if (trimmed.startsWith('v1=')) v1 = trimmed.substring(3).toLowerCase();
      }
      if (!t || !v1) return false;

      // Reject replays: a captured webhook signature used to verify forever
      // because `t` was parsed and then ignored.
      const signedAtMs = Number(t) > 1e12 ? Number(t) : Number(t) * 1000;
      if (!Number.isFinite(signedAtMs)) return false;
      if (Math.abs(Date.now() - signedAtMs) > EMAILIT_SIGNATURE_MAX_SKEW_SECONDS * 1000) return false;

      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const dataToSign = encoder.encode(t + '.' + rawBody);
      const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, dataToSign);

      const signatureArray = Array.from(new Uint8Array(signatureBuffer));
      const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Constant-time: `===` on a MAC leaks a prefix match through timing.
      return timingSafeEqualHex(signatureHex, v1);
    } catch (e) {
      return false;
    }
  }
}
