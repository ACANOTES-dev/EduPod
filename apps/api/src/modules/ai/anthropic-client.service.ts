import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ModuleDisabledException } from '../../common/exceptions/module-disabled.exception';
import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';
import { TenantModuleService } from '../../common/services/tenant-module.service';

// ─── Types ──────────────────────────────────────────────────────────────────

type NonStreamingParams = Anthropic.MessageCreateParamsNonStreaming;
interface CreateMessageOptions {
  tenantId: string;
  timeoutMs?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Shared Anthropic API client with circuit breaker protection.
 *
 * Centralises SDK instantiation, API key management, and failure isolation.
 * All AI feature services should inject this instead of creating their own
 * Anthropic client instances.
 */
@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  // ─── Client Accessor ────────────────────────────────────────────────────

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Whether the API key is configured and the client can be used. */
  get isConfigured(): boolean {
    return !!this.configService.get<string>('ANTHROPIC_API_KEY');
  }

  /**
   * Create a non-streaming message via the Anthropic API.
   * Wrapped in a circuit breaker to prevent cascading failures.
   */
  async createMessage(
    params: NonStreamingParams,
    options: CreateMessageOptions,
  ): Promise<Anthropic.Message> {
    const enabled = await this.tenantModuleService.isEnabled(options.tenantId, 'ai_functions');
    if (!enabled) {
      this.logger.warn(
        `Blocked Anthropic request for tenant ${options.tenantId}: ai_functions disabled`,
      );
      throw new ModuleDisabledException('ai_functions');
    }

    const client = this.getClient();
    const timeoutMs = options.timeoutMs ?? 30_000;

    return this.circuitBreaker.exec('anthropic', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await client.messages.create(params, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
