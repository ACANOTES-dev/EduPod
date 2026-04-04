import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import type { PulseDimension, PulseResult } from '@school/shared/behaviour';

import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

/** Statuses excluded from all behaviour aggregations. */
const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = [
  'withdrawn',
  'converted_to_safeguarding' as $Enums.IncidentStatus,
];

/** Redis cache TTL for pulse data (seconds). */
const PULSE_CACHE_TTL = 300; // 5 minutes

/** Weights for each pulse dimension. */
const WEIGHTS = {
  positive_ratio: 0.2,
  severity_index: 0.25,
  serious_incidents: 0.25,
  resolution_rate: 0.15,
  reporting_confidence: 0.15,
} as const;

/** Minimum reporting confidence gate for composite display. */
const CONFIDENCE_GATE = 0.5;

@Injectable()
export class BehaviourPulseService {
  private readonly logger = new Logger(BehaviourPulseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

  /**
   * Get the 5-dimension Behaviour Pulse, served from cache if available.
   */
  async getPulse(tenantId: string): Promise<PulseResult> {
    const cacheKey = `behaviour:pulse:${tenantId}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PulseResult;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [positiveRatio, severityIndex, seriousRate, resolutionRate, reportingConfidence] =
      await Promise.all([
        this.computePositiveRatio(tenantId, sevenDaysAgo, now),
        this.computeSeverityIndex(tenantId, sevenDaysAgo, now),
        this.computeSeriousIncidentRate(tenantId, sevenDaysAgo, now),
        this.computeResolutionRate(tenantId, thirtyDaysAgo, now),
        this.computeReportingConfidence(tenantId, sevenDaysAgo, now),
      ]);

    const dimensions: PulseDimension[] = [
      {
        name: 'positive_ratio',
        value: positiveRatio,
        weight: WEIGHTS.positive_ratio,
        label: 'Positive Ratio',
      },
      {
        name: 'severity_index',
        value: severityIndex,
        weight: WEIGHTS.severity_index,
        label: 'Severity Index',
      },
      {
        name: 'serious_incidents',
        value: seriousRate,
        weight: WEIGHTS.serious_incidents,
        label: 'Serious Incidents',
      },
      {
        name: 'resolution_rate',
        value: resolutionRate,
        weight: WEIGHTS.resolution_rate,
        label: 'Resolution Rate',
      },
      {
        name: 'reporting_confidence',
        value: reportingConfidence,
        weight: WEIGHTS.reporting_confidence,
        label: 'Reporting Confidence',
      },
    ];

    const composite = this.computeComposite(dimensions);

    const gateReason =
      reportingConfidence !== null && reportingConfidence < CONFIDENCE_GATE
        ? 'Composite score requires at least 50% of teaching staff to have logged this week.'
        : null;

    const result: PulseResult = {
      dimensions,
      composite,
      composite_available: composite !== null,
      gate_reason: gateReason,
      cached_at: now.toISOString(),
      pulse_enabled: true,
    };

    await client.set(cacheKey, JSON.stringify(result), 'EX', PULSE_CACHE_TTL);

    return result;
  }

  /**
   * Dimension 1: Positive Ratio (weight 20%)
   * positive / (positive + negative) in last 7 days.
   */
  async computePositiveRatio(tenantId: string, from: Date, to: Date): Promise<number | null> {
    const counts = await this.prisma.behaviourIncident.groupBy({
      by: ['polarity'],
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: from, lte: to },
        status: { notIn: EXCLUDED_STATUSES },
        retention_status: 'active' as $Enums.RetentionStatus,
        polarity: { in: ['positive', 'negative'] as $Enums.BehaviourPolarity[] },
      },
      _count: true,
    });

    const positive = counts.find((c) => c.polarity === 'positive')?._count ?? 0;
    const negative = counts.find((c) => c.polarity === 'negative')?._count ?? 0;
    const total = positive + negative;

    if (total === 0) return null;
    return positive / total;
  }

  /**
   * Dimension 2: Severity Index (weight 25%)
   * Inverted normalised average severity of negative incidents.
   * No negatives = 1.0 (best).
   */
  async computeSeverityIndex(tenantId: string, from: Date, to: Date): Promise<number> {
    const result = await this.prisma.behaviourIncident.aggregate({
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: from, lte: to },
        status: { notIn: EXCLUDED_STATUSES },
        retention_status: 'active' as $Enums.RetentionStatus,
        polarity: 'negative' as $Enums.BehaviourPolarity,
      },
      _avg: { severity: true },
      _count: true,
    });

    if (result._count === 0 || result._avg.severity === null) return 1.0;

    return 1 - (result._avg.severity - 1) / 9;
  }

  /**
   * Dimension 3: Serious Incident Count (weight 25%)
   * Rate of severity >= 7 negative incidents per 100 enrolled students.
   * Graduated decay curve.
   */
  async computeSeriousIncidentRate(tenantId: string, from: Date, to: Date): Promise<number> {
    const [seriousCount, enrolledCount] = await Promise.all([
      this.prisma.behaviourIncident.count({
        where: {
          tenant_id: tenantId,
          occurred_at: { gte: from, lte: to },
          status: { notIn: EXCLUDED_STATUSES },
          retention_status: 'active' as $Enums.RetentionStatus,
          polarity: 'negative' as $Enums.BehaviourPolarity,
          severity: { gte: 7 },
        },
      }),
      this.studentReadFacade.count(tenantId, {
        status: 'enrolled' as $Enums.StudentStatus,
      }),
    ]);

    if (enrolledCount === 0) return 1.0;

    const rate = (seriousCount / enrolledCount) * 100;

    // Graduated decay curve
    if (rate === 0) return 1.0;
    if (rate <= 0.5) return 1.0 - (rate / 0.5) * 0.2; // 1.0 -> 0.8
    if (rate <= 2.0) return 0.8 - ((rate - 0.5) / 1.5) * 0.4; // 0.8 -> 0.4
    if (rate <= 5.0) return 0.4 - ((rate - 2.0) / 3.0) * 0.3; // 0.4 -> 0.1
    return 0.0;
  }

  /**
   * Dimension 4: Resolution Rate (weight 15%)
   * follow_ups_completed / follow_ups_required over 30-day window.
   */
  async computeResolutionRate(tenantId: string, from: Date, to: Date): Promise<number> {
    const followUpsRequired = await this.prisma.behaviourIncident.count({
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: from, lte: to },
        status: { notIn: ['withdrawn' as $Enums.IncidentStatus] },
        retention_status: 'active' as $Enums.RetentionStatus,
        follow_up_required: true,
      },
    });

    if (followUpsRequired === 0) return 1.0;

    // Count resolved incidents (status = 'resolved' is the primary indicator)
    const resolvedCount = await this.prisma.behaviourIncident.count({
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: from, lte: to },
        retention_status: 'active' as $Enums.RetentionStatus,
        follow_up_required: true,
        status: 'resolved' as $Enums.IncidentStatus,
      },
    });

    return resolvedCount / followUpsRequired;
  }

  /**
   * Dimension 5: Reporting Confidence (weight 15%)
   * Distinct reporters in window / total staff with behaviour.log permission.
   */
  async computeReportingConfidence(tenantId: string, from: Date, to: Date): Promise<number | null> {
    const [distinctReporters, totalStaff] = await Promise.all([
      this.prisma.behaviourIncident
        .findMany({
          where: {
            tenant_id: tenantId,
            occurred_at: { gte: from, lte: to },
            status: { notIn: EXCLUDED_STATUSES },
            retention_status: 'active' as $Enums.RetentionStatus,
          },
          select: { reported_by_id: true },
          distinct: ['reported_by_id'],
        })
        .then((rows) => rows.length),
      // Count staff with behaviour.log permission
      this.rbacReadFacade.countMembershipsWithPermission(tenantId, 'behaviour.log'),
    ]);

    if (totalStaff === 0) return null;
    return distinctReporters / totalStaff;
  }

  /**
   * Compute weighted composite score from dimensions.
   * Returns null if reporting_confidence < 0.50 or any dimension is null.
   */
  computeComposite(dimensions: PulseDimension[]): number | null {
    const reportingConfidence = dimensions.find((d) => d.name === 'reporting_confidence');
    if (
      reportingConfidence?.value === null ||
      reportingConfidence?.value === undefined ||
      reportingConfidence.value < CONFIDENCE_GATE
    ) {
      return null;
    }

    // Check all dimensions have values
    if (dimensions.some((d) => d.value === null || d.value === undefined)) {
      return null;
    }

    return dimensions.reduce((sum, d) => sum + (d.value ?? 0) * d.weight, 0);
  }

  /**
   * Clear the Redis pulse cache for a tenant.
   */
  async invalidateCache(tenantId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`behaviour:pulse:${tenantId}`);
  }
}
