import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';

@Injectable()
export class ResendEmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private client: Resend | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
  ) {}

  /**
   * Whether the Resend API key is configured.
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('RESEND_API_KEY');
  }

  /**
   * Send an email via Resend.
   *
   * Lazily initialises the Resend client on first call.
   * Throws if RESEND_API_KEY is not configured.
   */
  async send(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
    tags?: { name: string; value: string }[];
    idempotencyKey?: string;
  }): Promise<{ messageId: string }> {
    const client = this.ensureClient();

    const defaultFrom = this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';
    const from = params.from ?? defaultFrom;

    this.logger.log(`Sending email to=${params.to} subject="${params.subject}"`);

    const { data, error } = await this.circuitBreaker.exec('resend', () =>
      client.emails.send({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
        ...(params.idempotencyKey ? { headers: { 'X-Entity-Ref-ID': params.idempotencyKey } } : {}),
      }),
    );

    if (error) {
      this.logger.error(`Resend email failed: ${error.message}`, error.name);
      throw new Error(`Resend email failed: ${error.message}`);
    }

    const messageId = data?.id ?? '';
    this.logger.log(`Email sent successfully messageId=${messageId}`);

    return { messageId };
  }

  private ensureClient(): Resend {
    if (this.client) {
      return this.client;
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('Resend is not configured. Set RESEND_API_KEY environment variable.');
    }

    this.client = new Resend(apiKey);
    return this.client;
  }
}
