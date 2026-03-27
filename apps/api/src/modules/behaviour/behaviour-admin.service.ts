import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  type AdminHealthResponse,
  type AdminPreviewResponse,
  type BackfillTasksDto,
  type DeadLetterItem,
  type RebuildAwardsDto,
  type RecomputePointsDto,
  type ResendNotificationDto,
  type RetentionPreviewResponse,
} from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { BehaviourScopeService } from './behaviour-scope.service';
import { PolicyReplayService } from './policy/policy-replay.service';

@Injectable()
export class BehaviourAdminService {
  private readonly logger = new Logger(BehaviourAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scopeService: BehaviourScopeService,
    private readonly policyReplayService: PolicyReplayService,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Health ───────────────────────────────────────────────────────────────

  async getHealth(tenantId: string): Promise<AdminHealthResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Queue depths
      const [behaviourWaiting, notificationsWaiting] = await Promise.all([
        this.behaviourQueue.getWaitingCount(),
        this.notificationsQueue.getWaitingCount(),
      ]);

      const [behaviourActive, notificationsActive] = await Promise.all([
        this.behaviourQueue.getActiveCount(),
        this.notificationsQueue.getActiveCount(),
      ]);

      // Dead letter depth
      const [behaviourFailed, notificationsFailed] = await Promise.all([
        this.behaviourQueue.getFailedCount(),
        this.notificationsQueue.getFailedCount(),
      ]);

      // Cache hit rate — approximation from Redis INFO
      const client = this.redis.getClient();
      let cacheHitRate = 0;
      try {
        const info = await client.info('stats');
        const hitsMatch = info.match(/keyspace_hits:(\d+)/);
        const missesMatch = info.match(/keyspace_misses:(\d+)/);
        if (hitsMatch?.[1] && missesMatch?.[1]) {
          const hits = parseInt(hitsMatch[1], 10);
          const misses = parseInt(missesMatch[1], 10);
          cacheHitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
        }
      } catch {
        // Redis INFO not available in all environments
      }

      // View freshness — check last refresh from pg_stat
      const viewFreshness: AdminHealthResponse['view_freshness'] = [
        { view_name: 'mv_student_behaviour_summary', last_refreshed_at: null },
        { view_name: 'mv_behaviour_exposure_rates', last_refreshed_at: null },
        { view_name: 'mv_behaviour_benchmarks', last_refreshed_at: null },
      ];

      // Scan backlog
      const scanBacklog = await tx.behaviourAttachment.count({
        where: {
          tenant_id: tenantId,
          scan_status: 'pending_scan' as $Enums.ScanStatus,
        },
      });

      // Active legal holds
      const legalHoldsActive = await tx.behaviourLegalHold.count({
        where: {
          tenant_id: tenantId,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
      });

      return {
        queue_depths: {
          behaviour_waiting: behaviourWaiting,
          behaviour_active: behaviourActive,
          notifications_waiting: notificationsWaiting,
          notifications_active: notificationsActive,
        },
        dead_letter_depth: behaviourFailed + notificationsFailed,
        cache_hit_rate: Math.round(cacheHitRate * 100) / 100,
        view_freshness: viewFreshness,
        scan_backlog: scanBacklog,
        legal_holds_active: legalHoldsActive,
      };
    }) as Promise<AdminHealthResponse>;
  }

  // ─── Dead Letter ──────────────────────────────────────────────────────────

  async listDeadLetterJobs(): Promise<DeadLetterItem[]> {
    const items: DeadLetterItem[] = [];

    const queues = [
      { queue: this.behaviourQueue, name: 'behaviour' },
      { queue: this.notificationsQueue, name: 'notifications' },
    ];

    for (const { queue, name } of queues) {
      const failedJobs = await queue.getFailed(0, 100);
      for (const job of failedJobs) {
        items.push({
          queue: name,
          job_id: job.id ?? '',
          job_name: job.name,
          failed_at: job.finishedOn
            ? new Date(job.finishedOn).toISOString()
            : new Date().toISOString(),
          failure_reason: job.failedReason ?? 'Unknown',
          retry_count: job.attemptsMade,
        });
      }
    }

    items.sort((a, b) => new Date(b.failed_at).getTime() - new Date(a.failed_at).getTime());
    return items;
  }

  async retryDeadLetterJob(jobId: string): Promise<void> {
    // Try behaviour queue first
    let job = await this.behaviourQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retried dead-letter job ${jobId} in behaviour queue`);
      return;
    }

    // Try notifications queue
    job = await this.notificationsQueue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Retried dead-letter job ${jobId} in notifications queue`);
      return;
    }

    throw new Error(`Job ${jobId} not found in any queue`);
  }

  // ─── Recompute Points ─────────────────────────────────────────────────────

  async recomputePointsPreview(
    tenantId: string,
    dto: RecomputePointsDto,
  ): Promise<AdminPreviewResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      let studentCount = 0;
      const sampleIds: string[] = [];

      if (dto.scope === 'student' && dto.student_id) {
        studentCount = 1;
        sampleIds.push(dto.student_id);
      } else if (dto.scope === 'year_group' && dto.year_group_id) {
        const students = await tx.student.findMany({
          where: { tenant_id: tenantId, year_group_id: dto.year_group_id, status: 'active' as $Enums.StudentStatus },
          select: { id: true },
          take: 10,
        });
        studentCount = await tx.student.count({
          where: { tenant_id: tenantId, year_group_id: dto.year_group_id, status: 'active' as $Enums.StudentStatus },
        });
        sampleIds.push(...students.map((s) => s.id));
      } else {
        studentCount = await tx.student.count({
          where: { tenant_id: tenantId, status: 'active' as $Enums.StudentStatus },
        });
        const students = await tx.student.findMany({
          where: { tenant_id: tenantId, status: 'active' as $Enums.StudentStatus },
          select: { id: true },
          take: 10,
        });
        sampleIds.push(...students.map((s) => s.id));
      }

      return {
        affected_records: studentCount,
        affected_students: studentCount,
        sample_records: sampleIds,
        estimated_duration: studentCount > 100 ? '~2min' : '~30s',
        warnings: dto.scope === 'tenant' ? ['This will invalidate all cached point totals for the entire school.'] : [],
        reversible: true,
        rollback_method: 'Re-run recompute. Points are computed from source records — idempotent.',
      };
    }) as Promise<AdminPreviewResponse>;
  }

  async recomputePoints(tenantId: string, dto: RecomputePointsDto): Promise<void> {
    const client = this.redis.getClient();

    if (dto.scope === 'student' && dto.student_id) {
      await client.del(`behaviour:points:${tenantId}:${dto.student_id}`);
    } else if (dto.scope === 'year_group' && dto.year_group_id) {
      // Invalidate all students in year group
      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
      await rlsClient.$transaction(async (txRaw) => {
        const tx = txRaw as unknown as PrismaService;
        const students = await tx.student.findMany({
          where: { tenant_id: tenantId, year_group_id: dto.year_group_id, status: 'active' as $Enums.StudentStatus },
          select: { id: true },
        });
        const pipeline = client.pipeline();
        for (const s of students) {
          pipeline.del(`behaviour:points:${tenantId}:${s.id}`);
        }
        await pipeline.exec();
      });
    } else {
      // Tenant-wide: delete all point cache keys
      const keys = await client.keys(`behaviour:points:${tenantId}:*`);
      if (keys.length > 0) {
        const pipeline = client.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    }

    this.logger.log(`Points recomputed for scope=${dto.scope} in tenant ${tenantId}`);
  }

  // ─── Recompute Pulse ──────────────────────────────────────────────────────

  async recomputePulse(tenantId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`behaviour:pulse:${tenantId}`);
    // Next request will recompute from source
    this.logger.log(`Pulse cache invalidated for tenant ${tenantId}`);
  }

  // ─── Refresh Views ────────────────────────────────────────────────────────

  async refreshViews(_tenantId: string): Promise<void> {
    // Materialised views are not tenant-scoped, but we can still refresh them
    await this.prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_behaviour_summary`;
    await this.prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_exposure_rates`;
    await this.prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_benchmarks`;
    this.logger.log(`All behaviour materialised views refreshed`);
  }

  // ─── Scope Audit ──────────────────────────────────────────────────────────

  async scopeAudit(
    tenantId: string,
    userId: string,
  ): Promise<{ scope_level: string; student_count: number; student_ids: string[] }> {
    // Load user permissions to resolve scope
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    type ScopeAuditResult = { scope_level: string; student_count: number; student_ids: string[] };
    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Get the user's scope (getUserScope needs permissions, derive from role)
      const scope = await this.scopeService.getUserScope(tenantId, userId);

      let studentFilter: Prisma.StudentWhereInput = {
        tenant_id: tenantId,
        status: 'active' as $Enums.StudentStatus,
      };

      // Apply scope filter
      if (scope.scope === 'class' && scope.classStudentIds) {
        studentFilter = {
          ...studentFilter,
          id: { in: scope.classStudentIds },
        };
      }
      // 'all' scope = no extra filter; 'own' scope = only their logged incidents (not applicable to student list)

      const [students, totalCount] = await Promise.all([
        tx.student.findMany({
          where: studentFilter,
          select: { id: true },
          take: 1000,
        }),
        tx.student.count({ where: studentFilter }),
      ]);

      return {
        scope_level: scope.scope,
        student_count: totalCount,
        student_ids: students.map((s) => s.id),
      };
    }) as Promise<ScopeAuditResult>;
  }

  // ─── Rebuild Awards Preview ───────────────────────────────────────────────

  async rebuildAwardsPreview(
    tenantId: string,
    dto: RebuildAwardsDto,
  ): Promise<AdminPreviewResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      let studentCount = 0;
      if (dto.scope === 'student' && dto.student_id) {
        studentCount = 1;
      } else if (dto.scope === 'year_group' && dto.year_group_id) {
        studentCount = await tx.student.count({
          where: { tenant_id: tenantId, year_group_id: dto.year_group_id, status: 'active' as $Enums.StudentStatus },
        });
      } else {
        studentCount = await tx.student.count({
          where: { tenant_id: tenantId, status: 'active' as $Enums.StudentStatus },
        });
      }

      return {
        affected_records: studentCount,
        affected_students: studentCount,
        sample_records: [],
        estimated_duration: studentCount > 100 ? '~3min' : '~45s',
        warnings: ['New awards may be created for students who crossed thresholds. Existing awards are not removed.'],
        reversible: false,
        rollback_method: 'New awards can be individually revoked via DELETE /awards/:id.',
      };
    }) as Promise<AdminPreviewResponse>;
  }

  // ─── Backfill Tasks Preview ───────────────────────────────────────────────

  async backfillTasksPreview(
    tenantId: string,
    dto: BackfillTasksDto,
  ): Promise<AdminPreviewResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Count entities that might need tasks
      let entityCount = 0;
      if (dto.scope === 'entity_type' && dto.entity_type) {
        if (dto.entity_type === 'sanction') {
          entityCount = await tx.behaviourSanction.count({
            where: { tenant_id: tenantId, retention_status: 'active' as $Enums.RetentionStatus },
          });
        } else if (dto.entity_type === 'intervention') {
          entityCount = await tx.behaviourIntervention.count({
            where: { tenant_id: tenantId, retention_status: 'active' as $Enums.RetentionStatus },
          });
        }
      } else {
        const sanctionCount = await tx.behaviourSanction.count({
          where: { tenant_id: tenantId, retention_status: 'active' as $Enums.RetentionStatus },
        });
        const interventionCount = await tx.behaviourIntervention.count({
          where: { tenant_id: tenantId, retention_status: 'active' as $Enums.RetentionStatus },
        });
        entityCount = sanctionCount + interventionCount;
      }

      return {
        affected_records: entityCount,
        affected_students: 0,
        sample_records: [],
        estimated_duration: entityCount > 500 ? '~5min' : '~1min',
        warnings: ['Only creates tasks that are missing — does not duplicate existing tasks.'],
        reversible: false,
        rollback_method: 'New tasks can be individually cancelled.',
      };
    }) as Promise<AdminPreviewResponse>;
  }

  // ─── Reindex Search Preview ───────────────────────────────────────────────

  async reindexSearchPreview(
    tenantId: string,
  ): Promise<AdminPreviewResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const incidentCount = await tx.behaviourIncident.count({
        where: { tenant_id: tenantId, retention_status: 'active' as $Enums.RetentionStatus },
      });

      return {
        affected_records: incidentCount,
        affected_students: 0,
        sample_records: [],
        estimated_duration: incidentCount > 5000 ? '~5min' : '~1min',
        warnings: ['Search index will be rebuilt from scratch. Brief search outage during rebuild.'],
        reversible: true,
        rollback_method: 'Idempotent — re-run to rebuild.',
      };
    }) as Promise<AdminPreviewResponse>;
  }

  // ─── Retention Preview ────────────────────────────────────────────────────

  async retentionPreview(tenantId: string): Promise<RetentionPreviewResponse> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Count active records for left students
      const leftStudentIds = await tx.student.findMany({
        where: {
          tenant_id: tenantId,
          status: { in: ['withdrawn', 'graduated'] as $Enums.StudentStatus[] },
        },
        select: { id: true },
      });

      const studentIds = leftStudentIds.map((s) => s.id);

      // Count records that would be archived
      let toArchive = 0;
      if (studentIds.length > 0) {
        toArchive = await tx.behaviourIncident.count({
          where: {
            tenant_id: tenantId,
            retention_status: 'active' as $Enums.RetentionStatus,
            participants: { some: { student_id: { in: studentIds } } },
          },
        });
      }

      // Count records that would be anonymised
      const toAnonymise = await tx.behaviourIncident.count({
        where: {
          tenant_id: tenantId,
          retention_status: 'archived' as $Enums.RetentionStatus,
        },
      });

      // Count held records
      const heldByLegalHold = await tx.behaviourLegalHold.count({
        where: {
          tenant_id: tenantId,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
      });

      return {
        to_archive: toArchive,
        to_anonymise: toAnonymise,
        held_by_legal_hold: heldByLegalHold,
        sample_to_archive: [],
        sample_to_anonymise: [],
      };
    }) as Promise<RetentionPreviewResponse>;
  }

  // ─── Retention Execute ────────────────────────────────────────────────────

  async retentionExecute(tenantId: string): Promise<{ job_id: string }> {
    const job = await this.behaviourQueue.add(
      'behaviour:retention-check',
      { tenant_id: tenantId, dry_run: false },
      { attempts: 1 },
    );
    return { job_id: job.id ?? '' };
  }

  // ─── Resend Notification ──────────────────────────────────────────────────

  async resendNotification(
    tenantId: string,
    dto: ResendNotificationDto,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Create a new acknowledgement row
      const entityId = dto.incident_id ?? dto.sanction_id;
      const _entityType = dto.incident_id ? 'incident' : 'sanction';

      if (!entityId) {
        throw new Error('Either incident_id or sanction_id is required');
      }

      await tx.behaviourParentAcknowledgement.create({
        data: {
          tenant_id: tenantId,
          incident_id: dto.incident_id ?? null,
          sanction_id: dto.sanction_id ?? null,
          parent_id: dto.parent_id,
          channel: dto.channel as $Enums.AcknowledgementChannel,
          sent_at: new Date(),
        },
      });
    });

    // Queue the notification
    await this.notificationsQueue.add(
      'behaviour:parent-notification',
      {
        tenant_id: tenantId,
        parent_id: dto.parent_id,
        incident_id: dto.incident_id ?? null,
        sanction_id: dto.sanction_id ?? null,
        channel: dto.channel,
        is_resend: true,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );

    this.logger.log(`Resend notification queued for parent ${dto.parent_id}`);
  }

  // ─── Policy Dry Run ───────────────────────────────────────────────────────

  async policyDryRun(
    tenantId: string,
    dto: {
      category_id: string;
      polarity: string;
      severity: number;
      context_type: string;
      student_year_group_id?: string;
      student_has_send?: boolean;
      student_has_active_intervention?: boolean;
      participant_role?: string;
      repeat_count?: number;
      weekday?: number;
      period_order?: number;
    },
  ) {
    return this.policyReplayService.dryRun(tenantId, dto as Parameters<typeof this.policyReplayService.dryRun>[1]);
  }
}
