import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Resend } from 'resend';

const TRANSIENT_ERRORS = new Set([
  'application_error',
  'internal_server_error',
  'rate_limit_exceeded',
  'concurrent_idempotent_requests',
]);
const MAX_ATTEMPTS = 3;
export interface EmailResult {
  delivered: boolean;
  error?: string;
}

/** Unconfigured and rejected deliveries are distinct; neither means sent. */
export function emailLogStatus(result: EmailResult): string {
  return result.delivered
    ? 'sent'
    : result.error === 'not_configured'
      ? 'skipped_not_configured'
      : 'failed';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: Resend | null = null;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress =
      this.config.get<string>('RESEND_FROM') ?? 'studio@example.com';
    if (apiKey) this.client = new Resend(apiKey);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Never throws. Retry transient failures with one key so ambiguous network
   * failures cannot duplicate an email accepted by the provider. */
  async send(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<EmailResult> {
    if (!this.client) return { delivered: false, error: 'not_configured' };
    const idempotencyKey = randomUUID();
    let error = 'application_error';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let retryable = true;
      try {
        const result = await this.client.emails.send(
          { from: this.fromAddress, ...params },
          { idempotencyKey },
        );
        if (!result.error && result.data?.id) return { delivered: true };
        error = result.error?.name ?? 'application_error';
        retryable = TRANSIENT_ERRORS.has(error);
      } catch {
        error = 'application_error';
      }
      if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
      await delay(1000 * 2 ** attempt);
    }
    // Do not log the message body: password-reset emails contain credentials.
    this.logger.error(`Email delivery failed (${error})`);
    return { delivered: false, error };
  }
}
