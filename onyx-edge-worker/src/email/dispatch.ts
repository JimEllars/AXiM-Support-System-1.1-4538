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

    if (this.isCircuitOpen) {
      if (now > this.circuitCooldownUntil) {
        this.isCircuitOpen = false;
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

  private tripCircuitBreaker(durationMs: number): void {
    this.isCircuitOpen = true;
    this.circuitCooldownUntil = Date.now() + durationMs;
  }

  public getTelemetry(): EmailItTelemetry | null {
    return this.latestTelemetry;
  }

  public static async verifyEmailItSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
    try {
      const parts = signatureHeader.split(',');
      let t = '', v1 = '';
      for (const part of parts) {
        if (part.startsWith('t=')) t = part.substring(2);
        if (part.startsWith('v1=')) v1 = part.substring(3);
      }
      if (!t || !v1) return false;

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

      return signatureHex === v1;
    } catch (e) {
      return false;
    }
  }
}
