import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: Resend | null = null;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress = this.config.get<string>('RESEND_FROM') ?? 'studio@example.com';
    if (apiKey) {
      this.client = new Resend(apiKey);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Never throws — automated workflows call this from a cron job with no
   * HTTP request to fail, so the caller always gets a result to log rather
   * than an exception to handle.
   */
  async send(params: { to: string; subject: string; html: string }): Promise<{
    delivered: boolean;
    error?: string;
  }> {
    if (!this.client) {
      this.logger.warn(`Resend not configured — would have sent "${params.subject}" to ${params.to}`);
      return { delivered: false, error: 'not_configured' };
    }
    try {
      await this.client.emails.send({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { delivered: true };
    } catch (err) {
      this.logger.error(`Failed to send email to ${params.to}`, err);
      return { delivered: false, error: err instanceof Error ? err.message : 'unknown_error' };
    }
  }
}
