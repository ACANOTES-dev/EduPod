import { Injectable, Logger } from '@nestjs/common';

import type { UpdateEarlyWarningConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Default config values ──────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
};

const DEFAULT_THRESHOLDS = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
};

const DEFAULT_ROUTING_RULES = {
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
};

const DEFAULT_HIGH_SEVERITY_EVENTS = [
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
];

@Injectable()
export class EarlyWarningConfigService {
  private readonly logger = new Logger(EarlyWarningConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /v1/early-warnings/config ────────────────────────────────────────

  async getConfig(tenantId: string) {
    const config = await this.prisma.earlyWarningConfig.findFirst({
      where: { tenant_id: tenantId },
    });

    if (!config) {
      // Return defaults if no config exists yet
      return {
        id: null,
        tenant_id: tenantId,
        is_enabled: false,
        weights_json: DEFAULT_WEIGHTS,
        thresholds_json: DEFAULT_THRESHOLDS,
        hysteresis_buffer: 10,
        routing_rules_json: DEFAULT_ROUTING_RULES,
        digest_day: 1,
        digest_recipients_json: [],
        high_severity_events_json: DEFAULT_HIGH_SEVERITY_EVENTS,
      };
    }

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      is_enabled: config.is_enabled,
      weights_json: config.weights_json ?? DEFAULT_WEIGHTS,
      thresholds_json: config.thresholds_json ?? DEFAULT_THRESHOLDS,
      hysteresis_buffer: config.hysteresis_buffer,
      routing_rules_json: config.routing_rules_json ?? DEFAULT_ROUTING_RULES,
      digest_day: config.digest_day,
      digest_recipients_json: config.digest_recipients_json ?? [],
      high_severity_events_json: config.high_severity_events_json ?? DEFAULT_HIGH_SEVERITY_EVENTS,
    };
  }

  // ─── PUT /v1/early-warnings/config ────────────────────────────────────────

  async updateConfig(tenantId: string, dto: UpdateEarlyWarningConfigDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const existing = await tx.earlyWarningConfig.findFirst({
        where: { tenant_id: tenantId },
      });

      const data: Record<string, unknown> = {};
      if (dto.is_enabled !== undefined) data.is_enabled = dto.is_enabled;
      if (dto.weights_json !== undefined) data.weights_json = dto.weights_json;
      if (dto.thresholds_json !== undefined) data.thresholds_json = dto.thresholds_json;
      if (dto.hysteresis_buffer !== undefined) data.hysteresis_buffer = dto.hysteresis_buffer;
      if (dto.routing_rules_json !== undefined) data.routing_rules_json = dto.routing_rules_json;
      if (dto.digest_day !== undefined) data.digest_day = dto.digest_day;
      if (dto.digest_recipients_json !== undefined)
        data.digest_recipients_json = dto.digest_recipients_json;
      if (dto.high_severity_events_json !== undefined)
        data.high_severity_events_json = dto.high_severity_events_json;

      if (existing) {
        return tx.earlyWarningConfig.update({
          where: { id: existing.id },
          data,
        });
      }

      // Create with defaults for fields not provided
      return tx.earlyWarningConfig.create({
        data: {
          tenant_id: tenantId,
          is_enabled: dto.is_enabled ?? false,
          weights_json: dto.weights_json ?? DEFAULT_WEIGHTS,
          thresholds_json: dto.thresholds_json ?? DEFAULT_THRESHOLDS,
          hysteresis_buffer: dto.hysteresis_buffer ?? 10,
          routing_rules_json: dto.routing_rules_json ?? DEFAULT_ROUTING_RULES,
          digest_day: dto.digest_day ?? 1,
          digest_recipients_json: dto.digest_recipients_json ?? [],
          high_severity_events_json: dto.high_severity_events_json ?? DEFAULT_HIGH_SEVERITY_EVENTS,
        },
      });
    });
  }
}
