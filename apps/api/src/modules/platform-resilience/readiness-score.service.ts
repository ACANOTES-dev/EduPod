import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type ReadinessDimension } from '@prisma/client';

import type { UpdateReadinessDimensionWeightDto } from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { BackupReadinessService } from './backup-readiness.service';
import {
  DEFAULT_READINESS_WEIGHTS,
  READINESS_DIMENSIONS,
  READINESS_DIMENSION_LABELS,
} from './readiness-score.constants';

interface DimensionSample {
  reason?: string;
  value: number | null;
}

export interface ReadinessBreakdownRow {
  dimension: ReadinessDimension;
  enabled: boolean;
  label: string;
  reason?: string;
  value: number;
  weight: number;
  weighted_contribution: number;
}

export interface ReadinessScoreResult {
  breakdown: ReadinessBreakdownRow[];
  computed_at: string;
  reasons: string[];
  score: number;
  worst_dimension: ReadinessDimension | null;
  worst_dimension_value: number | null;
  weights_sum: number;
}

type WeightRow = {
  dimension: ReadinessDimension;
  enabled: boolean;
  updated_at?: Date;
  updated_by_user_id?: string | null;
  weight: Prisma.Decimal | number | string;
};

@Injectable()
export class ReadinessScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupReadinessService,
    private readonly audit: PlatformAuditService,
  ) {}

  async compute(now = new Date()): Promise<ReadinessScoreResult> {
    const [weights, samples] = await Promise.all([this.getWeightMap(), this.collectSamples(now)]);
    const enabledWeightSum = READINESS_DIMENSIONS.reduce((sum, dimension) => {
      const weight = weights.get(dimension);
      return weight?.enabled ? sum + weight.weight : sum;
    }, 0);

    const breakdown = READINESS_DIMENSIONS.map((dimension) => {
      const configured = weights.get(dimension) ?? {
        dimension,
        enabled: true,
        weight: DEFAULT_READINESS_WEIGHTS[dimension],
      };
      const sample = samples.get(dimension) ?? { value: null };
      const value = clampScore(sample.value ?? 0);
      const normalizedWeight =
        configured.enabled && enabledWeightSum > 0
          ? (configured.weight / enabledWeightSum) * 100
          : 0;
      return {
        dimension,
        enabled: configured.enabled,
        label: READINESS_DIMENSION_LABELS[dimension],
        reason:
          sample.value === null ? (sample.reason ?? 'No data - pipeline silent.') : sample.reason,
        value,
        weight: round2(configured.weight),
        weighted_contribution: round2((value * normalizedWeight) / 100),
      };
    });

    const score =
      enabledWeightSum > 0
        ? round2(
            breakdown.reduce(
              (sum, row) => sum + (row.enabled ? (row.value * row.weight) / enabledWeightSum : 0),
              0,
            ),
          )
        : 0;
    const enabledRows = breakdown.filter((row) => row.enabled);
    const worst = enabledRows.reduce<ReadinessBreakdownRow | null>((current, row) => {
      if (!current) return row;
      if (row.value < current.value) return row;
      if (
        row.value === current.value &&
        row.weighted_contribution < current.weighted_contribution
      ) {
        return row;
      }
      return current;
    }, null);
    const reasons = enabledRows
      .filter((row) => row.reason)
      .sort((a, b) => a.value - b.value || b.weight - a.weight)
      .slice(0, 3)
      .map((row) => `${row.label}: ${row.reason}`);

    return {
      breakdown,
      computed_at: now.toISOString(),
      reasons,
      score,
      weights_sum: round2(enabledWeightSum),
      worst_dimension: worst?.dimension ?? null,
      worst_dimension_value: worst?.value ?? null,
    };
  }

  async snapshot(now = new Date()) {
    const result = await this.compute(now);
    const row = await this.prisma.platformReadinessScoreSnapshot.create({
      data: {
        breakdown: toJson(result.breakdown),
        reasons: toJson(result.reasons),
        score: new Prisma.Decimal(result.score),
        snapshot_at: now,
        weights_snapshot: toJson(
          result.breakdown.map((item) => ({
            dimension: item.dimension,
            enabled: item.enabled,
            weight: item.weight,
          })),
        ),
        worst_dimension: result.worst_dimension,
        worst_dimension_value:
          result.worst_dimension_value === null
            ? null
            : new Prisma.Decimal(result.worst_dimension_value),
      },
    });
    return serializeSnapshot(row);
  }

  async history(days = 90) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.platformReadinessScoreSnapshot.findMany({
      orderBy: { snapshot_at: 'asc' },
      where: { snapshot_at: { gte: since } },
    });
    return rows.map(serializeSnapshot);
  }

  async dimensions(): Promise<ReadinessBreakdownRow[]> {
    return (await this.compute()).breakdown;
  }

  async updateWeight(
    dimension: ReadinessDimension,
    dto: UpdateReadinessDimensionWeightDto,
    actorUserId: string,
    audit: PlatformAuditContext,
  ) {
    assertDimension(dimension);
    const existing = await this.prisma.platformReadinessDimensionWeight.findUnique({
      where: { dimension },
    });
    const before = existing
      ? serializeWeight(existing)
      : {
          dimension,
          enabled: true,
          updated_at: null,
          updated_by_user_id: null,
          weight: DEFAULT_READINESS_WEIGHTS[dimension],
        };
    const nextEnabled = dto.enabled ?? before.enabled;
    const requiresOwnerConfirmation = Math.abs(dto.weight - before.weight) > 10;
    if (requiresOwnerConfirmation) {
      await this.assertOwnerConfirmation({
        dimension,
        id: dto.owner_confirmation_id,
      });
    }

    const updated = await this.prisma.platformReadinessDimensionWeight.upsert({
      where: { dimension },
      create: {
        dimension,
        enabled: nextEnabled,
        updated_by_user_id: actorUserId,
        weight: new Prisma.Decimal(dto.weight),
      },
      update: {
        enabled: nextEnabled,
        updated_by_user_id: actorUserId,
        weight: new Prisma.Decimal(dto.weight),
      },
    });
    const after = serializeWeight(updated);
    await this.audit.log({
      ...audit,
      action: 'readiness_weight_updated',
      payload: {
        after,
        before,
        extra: {
          owner_confirmation_id: dto.owner_confirmation_id,
          owner_confirmation_required: requiresOwnerConfirmation,
        },
      },
      target_resource_id: dimension,
      target_resource_type: 'readiness_dimension_weight',
    });
    return after;
  }

  async latestSnapshotAt(): Promise<Date | null> {
    const row = await this.prisma.platformReadinessScoreSnapshot.findFirst({
      orderBy: { snapshot_at: 'desc' },
      select: { snapshot_at: true },
    });
    return row?.snapshot_at ?? null;
  }

  private async getWeightMap(): Promise<
    Map<ReadinessDimension, { enabled: boolean; weight: number }>
  > {
    const rows = await this.prisma.platformReadinessDimensionWeight.findMany();
    const map = new Map<ReadinessDimension, { enabled: boolean; weight: number }>();
    for (const dimension of READINESS_DIMENSIONS) {
      map.set(dimension, {
        enabled: true,
        weight: DEFAULT_READINESS_WEIGHTS[dimension],
      });
    }
    for (const row of rows) {
      map.set(row.dimension, {
        enabled: row.enabled,
        weight: decimalToNumber(row.weight),
      });
    }
    return map;
  }

  private async collectSamples(now: Date): Promise<Map<ReadinessDimension, DimensionSample>> {
    const entries = await Promise.all(
      READINESS_DIMENSIONS.map(
        async (dimension) => [dimension, await this.sampleDimension(dimension, now)] as const,
      ),
    );
    return new Map(entries);
  }

  private async sampleDimension(
    dimension: ReadinessDimension,
    now: Date,
  ): Promise<DimensionSample> {
    switch (dimension) {
      case 'synthetic_journeys':
        return this.syntheticJourneys();
      case 'alert_route_health':
        return this.alertRouteHealth();
      case 'evidence_freshness':
        return this.evidenceFreshness();
      case 'backup_readiness':
        return this.backupReadiness(now);
      case 'sentry_intake':
        return this.sentryIntake(now);
      case 'queue_canary':
        return this.queueCanary(now);
      case 'deploy_event_freshness':
        return this.deployFreshness(now);
      case 'unresolved_critical_incidents':
        return this.unresolvedCriticalIncidents();
      case 'certificate_expiry':
        return this.certificateExpiry();
      case 'external_dependency_status':
        return this.externalDependencyStatus();
    }
  }

  private async syntheticJourneys(): Promise<DimensionSample> {
    const definitions = await this.prisma.platformSyntheticCheckDefinition.findMany({
      include: { results: { orderBy: { ran_at: 'desc' }, take: 1 } },
      where: { enabled: true, kind: { not: 'queue_canary' } },
    });
    if (definitions.length === 0) {
      return { reason: 'No enabled synthetic journeys.', value: null };
    }
    const passed = definitions.filter((definition) => definition.results[0]?.status === 'passed');
    return {
      reason:
        passed.length === definitions.length
          ? 'All enabled non-queue synthetic journeys are passing.'
          : `${definitions.length - passed.length} enabled synthetic journey has no passing latest result.`,
      value: (passed.length / definitions.length) * 100,
    };
  }

  private async alertRouteHealth(): Promise<DimensionSample> {
    const routes = await this.prisma.platformAlertRoute.findMany({
      include: { health_checks: { orderBy: { ran_at: 'desc' }, take: 1 } },
      where: { enabled: true },
    });
    if (routes.length === 0) {
      return { reason: 'No enabled alert routes are configured.', value: null };
    }
    const healthy = routes.filter((route) => route.health_checks[0]?.success === true).length;
    return {
      reason:
        healthy === routes.length
          ? 'All enabled alert routes passed their latest health check.'
          : `${routes.length - healthy} enabled alert route has no passing health check.`,
      value: (healthy / routes.length) * 100,
    };
  }

  private async evidenceFreshness(): Promise<DimensionSample> {
    const rows = await this.prisma.platformEvidencePipeline.findMany({
      include: { status: true },
      where: { enabled: true },
    });
    if (rows.length === 0) {
      return { reason: 'No enabled evidence pipelines are configured.', value: null };
    }
    const penalty = rows.reduce((sum, row) => {
      const status = row.status?.status ?? 'unknown';
      if (status === 'fresh') return sum;
      if (status === 'lagging') return sum + 25;
      if (status === 'stale') return sum + 60;
      return sum + 100;
    }, 0);
    const nonFresh = rows.filter((row) => (row.status?.status ?? 'unknown') !== 'fresh');
    return {
      reason:
        nonFresh.length === 0
          ? 'All evidence pipelines are fresh.'
          : `${nonFresh.length} evidence pipeline is not fresh.`,
      value: Math.max(0, 100 - penalty / rows.length),
    };
  }

  private async backupReadiness(now: Date): Promise<DimensionSample> {
    const summary = await this.backups.getReadinessSummary(now);
    const value =
      summary.overall_status === 'green' ? 100 : summary.overall_status === 'amber' ? 60 : 20;
    return {
      reason: summary.reasons[0] ?? `Backup readiness is ${summary.overall_status}.`,
      value,
    };
  }

  private async sentryIntake(now: Date): Promise<DimensionSample> {
    const last = await this.prisma.platformSentryWebhookAudit.findFirst({
      orderBy: { received_at: 'desc' },
    });
    if (!last) {
      return { reason: 'No Sentry webhook receipts have been captured.', value: null };
    }
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [total, valid] = await Promise.all([
      this.prisma.platformSentryWebhookAudit.count({ where: { received_at: { gte: since } } }),
      this.prisma.platformSentryWebhookAudit.count({
        where: { received_at: { gte: since }, signature_valid: true },
      }),
    ]);
    const ageHours = (now.getTime() - last.received_at.getTime()) / 3_600_000;
    const freshnessScore = ageHours <= 1 ? 100 : ageHours <= 6 ? 70 : ageHours <= 24 ? 40 : 10;
    const signatureRate = total > 0 ? (valid / total) * 100 : 0;
    const value = Math.min(freshnessScore, signatureRate);
    return {
      reason:
        value >= 99
          ? 'Sentry webhook intake is fresh with valid signatures.'
          : `Last Sentry webhook is ${round2(ageHours)}h old; valid signature rate is ${round2(signatureRate)}%.`,
      value,
    };
  }

  private async queueCanary(now: Date): Promise<DimensionSample> {
    const definitions = await this.prisma.platformSyntheticCheckDefinition.findMany({
      include: { results: { orderBy: { ran_at: 'desc' }, take: 1 } },
      where: { enabled: true, kind: 'queue_canary' },
    });
    if (definitions.length === 0) {
      return { reason: 'No enabled queue canaries are configured.', value: null };
    }
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const passed = definitions.filter((definition) => {
      const latest = definition.results[0];
      if (!latest || latest.ran_at.getTime() < oneHourAgo || latest.status !== 'passed') {
        return false;
      }
      const expected = asRecord(definition.expected);
      const maxLatency = numericValue(expected.max_latency_ms);
      return maxLatency === null || latest.latency_ms === null || latest.latency_ms <= maxLatency;
    }).length;
    return {
      reason:
        passed === definitions.length
          ? 'All enabled queue canaries completed within their latency SLO.'
          : `${definitions.length - passed} queue canary has not passed within the last hour.`,
      value: (passed / definitions.length) * 100,
    };
  }

  private async deployFreshness(now: Date): Promise<DimensionSample> {
    const last = await this.prisma.platformDeployEvent.findFirst({
      orderBy: { deployed_at: 'desc' },
      where: { status: 'succeeded' },
    });
    if (!last) {
      return { reason: 'No successful deploy event has been captured.', value: null };
    }
    const ageDays = (now.getTime() - last.deployed_at.getTime()) / 86_400_000;
    const value = ageDays <= 30 ? 100 : ageDays <= 60 ? 60 : ageDays <= 90 ? 20 : 0;
    return {
      reason:
        value === 100
          ? 'A successful deploy event exists within the last 30 days.'
          : `Latest successful deploy event is ${round2(ageDays)} days old.`,
      value,
    };
  }

  private async unresolvedCriticalIncidents(): Promise<DimensionSample> {
    const count = await this.prisma.platformAlertHistory.count({
      where: { severity: 'critical', status: { not: 'resolved' } },
    });
    return {
      reason:
        count === 0
          ? 'No unresolved critical alert incidents.'
          : `${count} unresolved critical alert incident remains open.`,
      value: Math.max(0, 100 - count * 25),
    };
  }

  private async certificateExpiry(): Promise<DimensionSample> {
    const rows = await this.prisma.platformCertificateCheck.findMany();
    if (rows.length === 0) {
      return { reason: 'No certificate inventory rows are available.', value: null };
    }
    if (rows.some((row) => row.check_status !== 'valid' && row.check_status !== 'ok')) {
      return { reason: 'At least one certificate check is not valid.', value: 0 };
    }
    const minDays = Math.min(...rows.map((row) => row.days_until_expiry ?? 0));
    const value = minDays > 30 ? 100 : Math.max(0, (minDays / 30) * 100);
    return {
      reason:
        value === 100
          ? 'All certificates are more than 30 days from expiry.'
          : `Nearest certificate expires in ${minDays} days.`,
      value,
    };
  }

  private async externalDependencyStatus(): Promise<DimensionSample> {
    const rows = await this.prisma.platformExternalDependencyStatus.findMany();
    if (rows.length === 0) {
      return { reason: 'No external dependency status rows are available.', value: null };
    }
    const penalty = rows.reduce((sum, row) => {
      const status = row.status.toLowerCase();
      if (status === 'operational' || status === 'ok') return sum;
      if (status.includes('degraded')) return sum + 10;
      if (status.includes('partial')) return sum + 25;
      if (status.includes('major')) return sum + 50;
      return sum + 25;
    }, 0);
    return {
      reason:
        penalty === 0
          ? 'All external dependencies report operational status.'
          : `${rows.filter((row) => !['operational', 'ok'].includes(row.status.toLowerCase())).length} external dependency is degraded or unavailable.`,
      value: Math.max(0, 100 - penalty),
    };
  }

  private async assertOwnerConfirmation(input: {
    dimension: ReadinessDimension;
    id: string | undefined;
  }): Promise<void> {
    if (!input.id) {
      throw new UnauthorizedException({
        code: 'OWNER_CONFIRMATION_REQUIRED',
        message:
          'Changing a readiness dimension weight by more than 10 points requires owner confirmation.',
      });
    }
    const confirmation = await this.prisma.platformOwnerActionConfirmation.findUnique({
      where: { id: input.id },
    });
    if (
      !confirmation ||
      confirmation.action !== 'readiness_weight_updated' ||
      confirmation.target_resource_id !== input.dimension ||
      confirmation.execution_status !== 'executed'
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_OWNER_CONFIRMATION',
        message: 'Owner confirmation does not match this readiness weight change.',
      });
    }
  }
}

export function assertDimension(value: string): asserts value is ReadinessDimension {
  if (!READINESS_DIMENSIONS.includes(value as ReadinessDimension)) {
    throw new NotFoundException({
      code: 'READINESS_DIMENSION_NOT_FOUND',
      message: `Readiness dimension "${value}" is not recognised.`,
    });
  }
}

function serializeWeight(row: WeightRow) {
  return {
    dimension: row.dimension,
    enabled: row.enabled,
    updated_at: row.updated_at?.toISOString() ?? null,
    updated_by_user_id: row.updated_by_user_id ?? null,
    weight: decimalToNumber(row.weight),
  };
}

function serializeSnapshot(row: {
  breakdown: Prisma.JsonValue;
  id: string;
  reasons: Prisma.JsonValue;
  score: Prisma.Decimal;
  snapshot_at: Date;
  weights_snapshot: Prisma.JsonValue;
  worst_dimension: ReadinessDimension | null;
  worst_dimension_value: Prisma.Decimal | null;
}) {
  return {
    breakdown: row.breakdown,
    id: row.id,
    reasons: row.reasons,
    score: decimalToNumber(row.score),
    snapshot_at: row.snapshot_at.toISOString(),
    weights_snapshot: row.weights_snapshot,
    worst_dimension: row.worst_dimension,
    worst_dimension_value:
      row.worst_dimension_value === null ? null : decimalToNumber(row.worst_dimension_value),
  };
}

function decimalToNumber(value: Prisma.Decimal | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

function clampScore(value: number): number {
  return round2(Math.max(0, Math.min(100, value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
