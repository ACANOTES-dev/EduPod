import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformAiActionProposalStatus,
  PlatformAuditAction,
  Prisma,
  type PlatformAiActionProposal,
  type PlatformAiRecommendation,
} from '@prisma/client';

import type {
  ApprovePlatformAiActionProposalDto,
  CreatePlatformAgentHandoffDto,
  CreatePlatformAiActionProposalDto,
  ListPlatformAiActionProposalsQuery,
  OwnerActionConfirmationDto,
  PlatformAiActionKindDto,
  RejectPlatformAiActionProposalDto,
} from '@school/shared';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueManagementService } from '../queue-admin/queue-management.service';
import { RedisService } from '../redis/redis.service';

import { AlertHistoryService } from './alert-history.service';
import { AlertSilenceService } from './alert-silence.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { OwnerActionConfirmationService } from './owner-action-confirmation.service';
import type { EvidenceBundle, EvidenceItem } from './platform-evidence.service';
import { PlatformEvidenceService } from './platform-evidence.service';

const PROPOSAL_EXPIRY_HOURS = 48;
const MAX_RETRY_JOB_IDS = 20;

const ACTION_PERMISSION: Record<PlatformAiActionKindDto, string> = {
  acknowledge_alert: 'platform.alerts.acknowledge',
  clean_queue: 'platform.queues.clean',
  flush_global_cache: 'platform.cache.flush_global',
  flush_tenant_cache: 'platform.cache.flush_tenant',
  generate_repo_agent_handoff: 'platform.ai.read',
  manual_only: 'platform.ai.read',
  open_github_issue: 'platform.ai.approve_action',
  retry_jobs: 'platform.queues.retry',
  run_sentry_triage: 'platform.audit_log.view',
  schedule_maintenance: 'platform.maintenance.toggle',
  silence_alert: 'platform.alerts.silence',
};

const OWNER_ACTION: Partial<Record<PlatformAiActionKindDto, PlatformAuditAction>> = {
  clean_queue: PlatformAuditAction.queue_cleaned,
  flush_global_cache: PlatformAuditAction.cache_flushed_global,
};

const OWNER_CONFIRMATION_ACTIONS = new Set<PlatformAiActionKindDto>([
  'clean_queue',
  'flush_global_cache',
]);

const FORBIDDEN_ACTION_TERMS = [
  '.env',
  'cron',
  'deploy config',
  'ecosystem.config',
  'env var',
  'github action',
  'migration',
  'module gating registry',
  'module registry',
  'package upgrade',
  'production server config',
  'schema.prisma',
  'secret',
];

const FORBIDDEN_ACTION_KINDS = new Set([
  'apply_code_patch',
  'change_secret',
  'edit_cron',
  'edit_deploy_config',
  'edit_env',
  'edit_module_registry',
  'edit_schema',
  'migrate_database',
  'production_server_change',
]);

type ExecutorInput = {
  actorUserId: string;
  audit: PlatformAuditContext;
  payload: Record<string, unknown>;
  proposal: PlatformAiActionProposal;
};

type Executor = (input: ExecutorInput) => Promise<Record<string, unknown>>;

type RecommendationWithJson = PlatformAiRecommendation & {
  evidence: Prisma.JsonValue;
  proposed_action: Prisma.JsonValue | null;
};

@Injectable()
export class PlatformAiActionProposalsService {
  private readonly executors: Record<PlatformAiActionKindDto, Executor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformUsersService: PlatformUsersService,
    private readonly platformAuditService: PlatformAuditService,
    private readonly evidenceService: PlatformEvidenceService,
    private readonly alertHistoryService: AlertHistoryService,
    private readonly alertSilenceService: AlertSilenceService,
    private readonly maintenanceWindowService: MaintenanceWindowService,
    private readonly queueManagementService: QueueManagementService,
    private readonly ownerActionConfirmationService: OwnerActionConfirmationService,
    private readonly redisService: RedisService,
  ) {
    this.executors = {
      acknowledge_alert: (input) => this.acknowledgeAlert(input),
      clean_queue: () => this.ownerConfirmedAlready(),
      flush_global_cache: () => this.ownerConfirmedAlready(),
      flush_tenant_cache: (input) => this.flushTenantCache(input),
      generate_repo_agent_handoff: (input) => this.generateRepoAgentHandoff(input),
      manual_only: (input) => this.recordManualOnly(input),
      open_github_issue: (input) => this.draftGithubIssue(input),
      retry_jobs: (input) => this.retryJobs(input),
      run_sentry_triage: (input) => this.runSentryTriageHandoff(input),
      schedule_maintenance: (input) => this.scheduleMaintenance(input),
      silence_alert: (input) => this.silenceAlert(input),
    };
  }

  async create(
    dto: CreatePlatformAiActionProposalDto,
    userId: string,
    audit: PlatformAuditContext,
  ): Promise<PlatformAiActionProposal> {
    if (!dto.recommendation_id) {
      throw new BadRequestException({
        code: 'RECOMMENDATION_REQUIRED',
        message: 'Session 4D action proposals must be created from a recommendation.',
      });
    }

    const recommendation = await this.findRecommendation(dto.recommendation_id);
    const actionKind = this.normalizeActionKind(dto.action_kind, recommendation);
    await this.assertActionAllowed(actionKind, recommendation.proposed_action, audit, {
      recommendation_id: recommendation.id,
    });

    const evidence = await this.evidenceForRecommendation(recommendation);
    if (evidence.items.length === 0 || !hasCitedEvidence(recommendation, evidence.items)) {
      throw new BadRequestException({
        code: 'ACTION_PROPOSAL_REQUIRES_CITED_EVIDENCE',
        message: 'No action proposal can be created without recommendation citations and evidence.',
      });
    }

    const payload = proposalPayload(recommendation.proposed_action);
    const requiresOwnerConfirmation =
      recommendation.requires_owner_confirmation || OWNER_CONFIRMATION_ACTIONS.has(actionKind);
    const proposal = await this.prisma.platformAiActionProposal.create({
      data: {
        action_kind: actionKind,
        action_payload: toJson(payload),
        evidence: toJson(evidence.items),
        expires_at: new Date(Date.now() + PROPOSAL_EXPIRY_HOURS * 60 * 60 * 1000),
        proposed_by: 'recommendation_engine',
        reasoning: dto.reasoning?.trim() || recommendation.summary,
        recommendation_id: recommendation.id,
        required_permission: ACTION_PERMISSION[actionKind],
        requires_owner_confirmation: requiresOwnerConfirmation,
        target_resource_id: recommendation.target_resource_id,
        target_resource_type: recommendation.target_resource_type,
        target_tenant_id: recommendation.target_tenant_id,
      },
    });

    await this.platformAuditService.log({
      ...audit,
      action: PlatformAuditAction.ai_action_proposed,
      target_resource_type: 'platform_ai_action_proposal',
      target_resource_id: proposal.id,
      target_tenant_id: proposal.target_tenant_id ?? undefined,
      payload: {
        after: proposal,
        extra: {
          action_kind: actionKind,
          recommendation_id: recommendation.id,
          required_permission: proposal.required_permission,
        },
      },
      reason: 'Operator created a supervised action proposal from a cited recommendation.',
    });

    return proposal;
  }

  async list(query: ListPlatformAiActionProposalsQuery): Promise<PlatformAiActionProposal[]> {
    return this.prisma.platformAiActionProposal.findMany({
      where: {
        recommendation_id: query.recommendation_id,
        status: query.status as PlatformAiActionProposalStatus,
        target_tenant_id: query.target_tenant_id,
      },
      orderBy: { proposed_at: 'desc' },
      take: 100,
    });
  }

  async get(id: string): Promise<PlatformAiActionProposal> {
    const proposal = await this.prisma.platformAiActionProposal.findUnique({ where: { id } });
    if (!proposal) {
      throw new NotFoundException({
        code: 'AI_ACTION_PROPOSAL_NOT_FOUND',
        message: `AI action proposal "${id}" not found.`,
      });
    }
    return proposal;
  }

  async approve(
    id: string,
    dto: ApprovePlatformAiActionProposalDto,
    userId: string,
    audit: PlatformAuditContext,
  ): Promise<PlatformAiActionProposal> {
    const proposal = await this.getApprovableProposal(id);
    await this.assertApprovalPermissions(proposal, userId);
    await this.assertActionAllowed(
      proposal.action_kind as PlatformAiActionKindDto,
      proposal.action_payload,
      audit,
      { proposal_id: proposal.id },
    );

    if (proposal.requires_owner_confirmation) {
      return this.approveWithOwnerConfirmation(proposal, dto, userId, audit);
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'APPROVAL_REASON_REQUIRED',
        message: 'Approval reason is required.',
      });
    }

    await this.markApproved(proposal, userId, reason, audit);
    return this.executeApprovedProposal(proposal, userId, audit);
  }

  async reject(
    id: string,
    dto: RejectPlatformAiActionProposalDto,
    userId: string,
    audit: PlatformAuditContext,
  ): Promise<PlatformAiActionProposal> {
    const proposal = await this.getApprovableProposal(id);
    const updated = await this.prisma.platformAiActionProposal.update({
      where: { id: proposal.id },
      data: {
        rejected_at: new Date(),
        rejected_by_user_id: userId,
        rejection_reason: dto.reason,
        status: 'rejected',
      },
    });
    await this.platformAuditService.log({
      ...audit,
      action: PlatformAuditAction.ai_action_rejected,
      target_resource_type: 'platform_ai_action_proposal',
      target_resource_id: proposal.id,
      target_tenant_id: proposal.target_tenant_id ?? undefined,
      payload: { before: proposal, after: updated },
      reason: dto.reason,
    });
    return updated;
  }

  async createHandoff(
    dto: CreatePlatformAgentHandoffDto,
    userId: string,
    audit?: PlatformAuditContext,
  ) {
    if (!dto.recommendation_id) {
      throw new BadRequestException({
        code: 'RECOMMENDATION_REQUIRED_FOR_HANDOFF',
        message: 'Session 4D handoff prompts must be generated from cited recommendation evidence.',
      });
    }
    const recommendation = await this.findRecommendation(dto.recommendation_id);
    const evidence = await this.evidenceForRecommendation(recommendation);
    if (evidence.items.length === 0) {
      throw new BadRequestException({
        code: 'HANDOFF_REQUIRES_EVIDENCE',
        message: 'Repo-agent handoff prompts require cited evidence.',
      });
    }
    const suspectedRepoAreas = suspectedRepoAreasFromEvidence(evidence.items);
    const title = dto.title ?? recommendation?.title ?? 'EduPod incident fix handoff';
    const summary = dto.summary ?? recommendation?.summary ?? 'No recommendation summary supplied.';
    const hypothesis =
      dto.hypothesis ??
      recommendation?.detailed_reasoning ??
      'Use the evidence below to independently investigate the incident.';
    const promptMarkdown = redactSecrets(
      buildHandoffPrompt({
        evidence: evidence.items,
        hypothesis,
        suspectedRepoAreas,
        summary,
        title,
      }),
    );

    assertNoSecrets(promptMarkdown);

    const created = await this.prisma.platformAgentHandoffPrompt.create({
      data: {
        created_by_user_id: userId,
        evidence: toJson(evidence.items),
        hypothesis,
        incident_id: dto.incident_id,
        prompt_markdown: promptMarkdown,
        recommendation_id: recommendation?.id,
        summary,
        suspected_repo_areas: suspectedRepoAreas,
        title: title.slice(0, 200),
      },
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: PlatformAuditAction.ai_action_executed,
        target_resource_type: 'platform_agent_handoff_prompt',
        target_resource_id: created.id,
        target_tenant_id: recommendation?.target_tenant_id ?? undefined,
        payload: { after: created, extra: { action_kind: 'generate_repo_agent_handoff' } },
        reason: 'Generated a repo-agent handoff prompt from cited evidence.',
      });
    }

    return created;
  }

  async getHandoff(id: string) {
    const handoff = await this.prisma.platformAgentHandoffPrompt.findUnique({ where: { id } });
    if (!handoff) {
      throw new NotFoundException({
        code: 'AGENT_HANDOFF_NOT_FOUND',
        message: `Repo-agent handoff prompt "${id}" not found.`,
      });
    }
    return handoff;
  }

  private async findRecommendation(id: string): Promise<RecommendationWithJson> {
    const recommendation = await this.prisma.platformAiRecommendation.findUnique({
      where: { id },
    });
    if (!recommendation) {
      throw new NotFoundException({
        code: 'PLATFORM_AI_RECOMMENDATION_NOT_FOUND',
        message: 'Recommendation not found.',
      });
    }
    if (recommendation.expires_at <= new Date()) {
      throw new BadRequestException({
        code: 'RECOMMENDATION_EXPIRED',
        message: 'Expired recommendations cannot create action proposals.',
      });
    }
    return recommendation as RecommendationWithJson;
  }

  private normalizeActionKind(
    requested: PlatformAiActionKindDto | undefined,
    recommendation: RecommendationWithJson,
  ): PlatformAiActionKindDto {
    if (requested) return requested;
    if (recommendation.requires_repo_agent_handoff) return 'generate_repo_agent_handoff';
    const payload = proposalPayload(recommendation.proposed_action);
    const rawKind =
      readString(payload, 'action_kind') ??
      readString(payload, 'kind') ??
      readString(payload, 'action_type') ??
      readString(payload, 'type') ??
      'manual_only';
    return normalizeActionKind(rawKind);
  }

  private async evidenceForRecommendation(
    recommendation: RecommendationWithJson,
  ): Promise<EvidenceBundle> {
    const stored = parseEvidenceItems(recommendation.evidence);
    const fresh = await this.freshEvidenceForRecommendation(recommendation);
    return { items: mergeEvidenceItems(stored, fresh.items) };
  }

  private async freshEvidenceForRecommendation(
    recommendation: RecommendationWithJson,
  ): Promise<EvidenceBundle> {
    if (recommendation.target_resource_type === 'queue' && recommendation.target_resource_id) {
      return this.evidenceService.forQueue(recommendation.target_resource_id);
    }
    if (recommendation.target_resource_type === 'alert' && recommendation.target_resource_id) {
      return this.evidenceService.forAlert(recommendation.target_resource_id);
    }
    if (recommendation.target_resource_type === 'tenant' && recommendation.target_tenant_id) {
      return this.evidenceService.forTenant(recommendation.target_tenant_id);
    }
    if (recommendation.target_tenant_id) {
      return this.evidenceService.forTenant(recommendation.target_tenant_id);
    }
    return { items: [] };
  }

  private async getApprovableProposal(id: string): Promise<PlatformAiActionProposal> {
    const proposal = await this.get(id);
    if (proposal.status !== 'awaiting_approval') {
      throw new BadRequestException({
        code: 'AI_ACTION_PROPOSAL_NOT_AWAITING_APPROVAL',
        message: 'Only awaiting proposals can be approved or rejected.',
      });
    }
    if (proposal.expires_at <= new Date()) {
      await this.prisma.platformAiActionProposal.update({
        where: { id },
        data: { status: 'expired' },
      });
      throw new BadRequestException({
        code: 'AI_ACTION_PROPOSAL_EXPIRED',
        message: 'This action proposal has expired.',
      });
    }
    return proposal;
  }

  private async assertApprovalPermissions(
    proposal: PlatformAiActionProposal,
    userId: string,
  ): Promise<void> {
    const [canApproveAi, canApproveUnderlying] = await Promise.all([
      this.platformUsersService.hasPermission(userId, 'platform.ai.approve_action'),
      this.platformUsersService.hasPermission(userId, proposal.required_permission),
    ]);
    if (!canApproveAi || !canApproveUnderlying) {
      throw new ForbiddenException({
        code: 'AI_ACTION_APPROVAL_PERMISSION_DENIED',
        message:
          'Approving a supervised action requires platform.ai.approve_action and the underlying action permission.',
      });
    }
  }

  private async assertActionAllowed(
    actionKind: PlatformAiActionKindDto,
    payload: unknown,
    audit: PlatformAuditContext,
    target: { proposal_id?: string; recommendation_id?: string },
  ): Promise<void> {
    const serialized = JSON.stringify({ actionKind, payload }).toLowerCase();
    const blockedKind = FORBIDDEN_ACTION_KINDS.has(actionKind);
    const blockedTerm = FORBIDDEN_ACTION_TERMS.find((term) => serialized.includes(term));
    if (!this.executors[actionKind] || blockedKind || blockedTerm) {
      await this.platformAuditService.log({
        ...audit,
        action: PlatformAuditAction.ai_action_rejected,
        target_resource_type: target.proposal_id
          ? 'platform_ai_action_proposal'
          : 'platform_ai_recommendation',
        target_resource_id: target.proposal_id ?? target.recommendation_id,
        payload: {
          extra: {
            action_kind: actionKind,
            blocked_reason: blockedKind ? 'forbidden_action_kind' : blockedTerm,
          },
        },
        reason: 'Blocked forbidden AI action proposal.',
      });
      throw new ForbiddenException({
        code: 'NO_EXECUTOR',
        message:
          'This action kind is not available to the supervised executor or is blocked by Session 4D safety rules.',
      });
    }
  }

  private async approveWithOwnerConfirmation(
    proposal: PlatformAiActionProposal,
    dto: ApprovePlatformAiActionProposalDto,
    userId: string,
    audit: PlatformAuditContext,
  ): Promise<PlatformAiActionProposal> {
    const confirmation = dto.owner_confirmation;
    if (!confirmation) {
      throw new BadRequestException({
        code: 'OWNER_CONFIRMATION_REQUIRED',
        message: 'This supervised action requires owner confirmation.',
      });
    }
    const ownerAction = OWNER_ACTION[proposal.action_kind as PlatformAiActionKindDto];
    if (!ownerAction) {
      throw new ForbiddenException({
        code: 'OWNER_ACTION_NOT_REGISTERED',
        message: 'No owner-confirmed executor is registered for this action.',
      });
    }

    const ownerInput: OwnerActionConfirmationDto = {
      action: ownerAction,
      confirmation_phrase: confirmation.confirmation_phrase,
      payload: proposal.action_payload,
      reason: confirmation.reason,
      target_resource_id: proposal.target_resource_id ?? undefined,
      target_resource_type: proposal.target_resource_type ?? proposal.action_kind,
      target_tenant_id: proposal.target_tenant_id ?? undefined,
      typed_confirmation: confirmation.typed_confirmation,
    };

    const result = await this.ownerActionConfirmationService.confirmAndExecute(
      ownerInput,
      userId,
      audit,
    );
    await this.markApproved(proposal, userId, confirmation.reason, audit, result.confirmation_id);
    const status =
      result.execution_status === 'executed'
        ? PlatformAiActionProposalStatus.executed
        : PlatformAiActionProposalStatus.failed;
    const updated = await this.prisma.platformAiActionProposal.update({
      where: { id: proposal.id },
      data: {
        executed_at: new Date(),
        execution_failed_at: result.execution_status === 'failed' ? new Date() : null,
        execution_result: toJson(result),
        status,
      },
    });
    await this.logExecuted(updated, audit, confirmation.reason);
    return updated;
  }

  private async markApproved(
    proposal: PlatformAiActionProposal,
    userId: string,
    reason: string,
    audit: PlatformAuditContext,
    ownerConfirmationId?: string,
  ): Promise<void> {
    const updated = await this.prisma.platformAiActionProposal.update({
      where: { id: proposal.id },
      data: {
        approved_at: new Date(),
        approved_by_user_id: userId,
        owner_confirmation_id: ownerConfirmationId,
        status: 'approved',
      },
    });
    await this.platformAuditService.log({
      ...audit,
      action: PlatformAuditAction.ai_action_approved,
      target_resource_type: 'platform_ai_action_proposal',
      target_resource_id: proposal.id,
      target_tenant_id: proposal.target_tenant_id ?? undefined,
      payload: { before: proposal, after: updated },
      reason,
    });
  }

  private async executeApprovedProposal(
    proposal: PlatformAiActionProposal,
    userId: string,
    audit: PlatformAuditContext,
  ): Promise<PlatformAiActionProposal> {
    const executing = await this.prisma.platformAiActionProposal.update({
      where: { id: proposal.id },
      data: { status: 'executing' },
    });
    try {
      const result = await this.executors[proposal.action_kind as PlatformAiActionKindDto]({
        actorUserId: userId,
        audit,
        payload: proposalPayload(proposal.action_payload),
        proposal: executing,
      });
      const updated = await this.prisma.platformAiActionProposal.update({
        where: { id: proposal.id },
        data: {
          executed_at: new Date(),
          execution_result: toJson(result),
          status: 'executed',
        },
      });
      await this.logExecuted(updated, audit, 'Supervised AI action executed after approval.');
      return updated;
    } catch (err: unknown) {
      const updated = await this.prisma.platformAiActionProposal.update({
        where: { id: proposal.id },
        data: {
          execution_failed_at: new Date(),
          execution_result: toJson({ error: err instanceof Error ? err.message : String(err) }),
          status: 'failed',
        },
      });
      await this.logExecuted(updated, audit, 'Supervised AI action failed after approval.');
      return updated;
    }
  }

  private async logExecuted(
    proposal: PlatformAiActionProposal,
    audit: PlatformAuditContext,
    reason: string,
  ): Promise<void> {
    await this.platformAuditService.log({
      ...audit,
      action: PlatformAuditAction.ai_action_executed,
      target_resource_type: 'platform_ai_action_proposal',
      target_resource_id: proposal.id,
      target_tenant_id: proposal.target_tenant_id ?? undefined,
      payload: {
        after: proposal,
        extra: {
          action_kind: proposal.action_kind,
          execution_status: proposal.status,
        },
      },
      reason,
    });
  }

  private async silenceAlert(input: ExecutorInput): Promise<Record<string, unknown>> {
    const endsAt = readDate(input.payload, 'ends_at') ?? new Date(Date.now() + 60 * 60 * 1000);
    const silence = await this.alertSilenceService.create(
      {
        alert_rule_id:
          readString(input.payload, 'alert_rule_id') ??
          input.proposal.target_resource_id ??
          undefined,
        component: readAlertComponent(input.payload),
        ends_at: endsAt,
        reason: readString(input.payload, 'reason') ?? 'Supervised AI alert silence.',
        scope: readSilenceScope(input.payload),
        starts_at: readDate(input.payload, 'starts_at') ?? new Date(),
      },
      input.actorUserId,
      input.audit,
    );
    return { silence_id: silence.id };
  }

  private async acknowledgeAlert(input: ExecutorInput): Promise<Record<string, unknown>> {
    const alertId = readString(input.payload, 'alert_id') ?? input.proposal.target_resource_id;
    if (!alertId) {
      throw new BadRequestException({
        code: 'ALERT_ID_REQUIRED',
        message: 'Alert id is required to acknowledge an alert.',
      });
    }
    const alert = await this.alertHistoryService.acknowledge(
      alertId,
      input.actorUserId,
      input.audit,
    );
    return { alert_id: alert.id, status: alert.status };
  }

  private async retryJobs(input: ExecutorInput): Promise<Record<string, unknown>> {
    const queue = readString(input.payload, 'queue') ?? input.proposal.target_resource_id;
    const jobIds = readStringArray(input.payload, 'job_ids').slice(0, MAX_RETRY_JOB_IDS);
    if (!queue || jobIds.length === 0) {
      throw new BadRequestException({
        code: 'QUEUE_RETRY_PAYLOAD_REQUIRED',
        message: 'Queue name and at least one job id are required.',
      });
    }
    const retried: string[] = [];
    const failed: Array<{ error: string; job_id: string }> = [];
    for (const jobId of jobIds) {
      try {
        await this.queueManagementService.retryJob(queue, jobId);
        retried.push(jobId);
      } catch (err: unknown) {
        failed.push({ error: err instanceof Error ? err.message : String(err), job_id: jobId });
      }
    }
    await this.platformAuditService.log({
      ...input.audit,
      action: PlatformAuditAction.job_retried,
      target_resource_type: 'queue',
      target_resource_id: queue,
      payload: { after: { failed, retried }, extra: { action_kind: 'retry_jobs' } },
      reason: 'Retried jobs from a supervised AI action proposal.',
    });
    return { failed, queue, retried };
  }

  private async flushTenantCache(input: ExecutorInput): Promise<Record<string, unknown>> {
    const tenantId =
      readString(input.payload, 'tenant_id') ??
      input.proposal.target_tenant_id ??
      input.proposal.target_resource_id;
    if (!tenantId) {
      throw new BadRequestException({
        code: 'TENANT_ID_REQUIRED',
        message: 'Tenant id is required to flush tenant cache.',
      });
    }
    const cacheType = readCacheType(input.payload);
    const keysDeleted = await this.flushTenantCacheKeys(tenantId, cacheType);
    await this.platformAuditService.log({
      ...input.audit,
      action: PlatformAuditAction.cache_flushed_tenant,
      target_resource_type: 'cache',
      target_resource_id: cacheType,
      target_tenant_id: tenantId,
      payload: {
        after: { keys_deleted: keysDeleted },
        extra: { action_kind: 'flush_tenant_cache' },
      },
      reason: 'Flushed tenant cache from a supervised AI action proposal.',
    });
    return { cache_type: cacheType, keys_deleted: keysDeleted, tenant_id: tenantId };
  }

  private async scheduleMaintenance(input: ExecutorInput): Promise<Record<string, unknown>> {
    const startsAt = readDate(input.payload, 'starts_at') ?? new Date();
    const endsAt =
      readDate(input.payload, 'ends_at') ?? new Date(startsAt.getTime() + 60 * 60 * 1000);
    const window = await this.maintenanceWindowService.create(
      {
        description: readString(input.payload, 'description') ?? input.proposal.reasoning,
        ends_at: endsAt,
        starts_at: startsAt,
        title: readString(input.payload, 'title') ?? 'Supervised AI maintenance window',
      },
      input.actorUserId,
      input.audit,
    );
    return { maintenance_window_id: window.id };
  }

  private async draftGithubIssue(input: ExecutorInput): Promise<Record<string, unknown>> {
    return {
      draft_only: true,
      issue_body: input.proposal.reasoning,
      issue_title: readString(input.payload, 'title') ?? 'EduPod platform incident follow-up',
      note: 'No GitHub integration is configured in the platform dashboard; no issue was opened.',
    };
  }

  private async generateRepoAgentHandoff(input: ExecutorInput): Promise<Record<string, unknown>> {
    const handoff = await this.createHandoff(
      { recommendation_id: proposalRecommendationId(input.proposal) },
      input.actorUserId,
    );
    return { handoff_id: handoff.id };
  }

  private async runSentryTriageHandoff(input: ExecutorInput): Promise<Record<string, unknown>> {
    const handoff = await this.createHandoff(
      {
        recommendation_id: proposalRecommendationId(input.proposal),
        title: 'Sentry triage runbook handoff',
        summary:
          'Use the existing docs/runbooks/agent-sentry-triage.md workflow. The dashboard does not run Sentry triage or bypass its guardrails.',
      },
      input.actorUserId,
    );
    return {
      handoff_id: handoff.id,
      runbook: 'docs/runbooks/agent-sentry-triage.md',
      guardrails_preserved: true,
    };
  }

  private async recordManualOnly(input: ExecutorInput): Promise<Record<string, unknown>> {
    return {
      manual_only: true,
      note: 'This recommendation was recorded as manual-only; no platform state was changed.',
      proposal_id: input.proposal.id,
    };
  }

  private async ownerConfirmedAlready(): Promise<Record<string, unknown>> {
    return { owner_confirmation_required: true };
  }

  private async flushTenantCacheKeys(
    tenantId: string,
    cacheType: 'all' | 'domains' | 'modules' | 'permissions',
  ): Promise<number> {
    const tasks: Array<Promise<number>> = [];
    if (cacheType === 'permissions' || cacheType === 'all') {
      tasks.push(this.flushTenantPermissionKeys(tenantId));
    }
    if (cacheType === 'domains' || cacheType === 'all') {
      tasks.push(this.flushTenantDomainKeys(tenantId));
    }
    if (cacheType === 'modules' || cacheType === 'all') {
      tasks.push(this.redisService.getClient().del(`tenant_modules:${tenantId}`));
    }
    const counts = await Promise.all(tasks);
    return counts.reduce((total, count) => total + count, 0);
  }

  private async flushTenantPermissionKeys(tenantId: string): Promise<number> {
    const memberships = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantMembership.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      }),
    );
    if (memberships.length === 0) return 0;
    return this.redisService
      .getClient()
      .del(
        ...memberships.flatMap((membership) => [
          `permissions:${membership.id}`,
          `owner:${membership.id}`,
        ]),
      );
  }

  private async flushTenantDomainKeys(tenantId: string): Promise<number> {
    const domains = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.findMany({
        where: { tenant_id: tenantId },
        select: { domain: true },
      }),
    );
    if (domains.length === 0) return 0;
    return this.redisService
      .getClient()
      .del(...domains.map((domain) => `tenant_domain:${domain.domain}`));
  }
}

function normalizeActionKind(value: string): PlatformAiActionKindDto {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_');
  if (normalized.includes('silence')) return 'silence_alert';
  if (normalized.includes('acknowledge') || normalized.includes('resolve_alert')) {
    return 'acknowledge_alert';
  }
  if (normalized.includes('retry')) return 'retry_jobs';
  if (normalized.includes('tenant_cache')) return 'flush_tenant_cache';
  if (normalized.includes('global_cache')) return 'flush_global_cache';
  if (normalized.includes('clean_queue')) return 'clean_queue';
  if (normalized.includes('maintenance')) return 'schedule_maintenance';
  if (normalized.includes('github')) return 'open_github_issue';
  if (normalized.includes('sentry')) return 'run_sentry_triage';
  if (normalized.includes('handoff') || normalized.includes('repo_agent')) {
    return 'generate_repo_agent_handoff';
  }
  if (FORBIDDEN_ACTION_KINDS.has(normalized)) return normalized as PlatformAiActionKindDto;
  return 'manual_only';
}

function proposalRecommendationId(proposal: PlatformAiActionProposal): string {
  if (!proposal.recommendation_id) {
    throw new BadRequestException({
      code: 'PROPOSAL_RECOMMENDATION_REQUIRED',
      message: 'This action proposal is missing its recommendation link.',
    });
  }
  return proposal.recommendation_id;
}

function proposalPayload(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || value === Prisma.JsonNull) return {};
  return isRecord(value) ? value : {};
}

function parseEvidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEvidenceItem);
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.link === 'string' &&
    typeof value.occurred_at === 'string' &&
    typeof value.snippet === 'string' &&
    'raw' in value
  );
}

function mergeEvidenceItems(a: EvidenceItem[], b: EvidenceItem[]): EvidenceItem[] {
  const byKey = new Map<string, EvidenceItem>();
  for (const item of [...a, ...b]) {
    byKey.set(`${item.kind}:${item.id}`, item);
  }
  return [...byKey.values()];
}

function hasCitedEvidence(
  recommendation: RecommendationWithJson,
  evidence: EvidenceItem[],
): boolean {
  const ids = new Set(evidence.map((item) => item.id));
  const citations = [...recommendation.summary.matchAll(/\[E:([^\]]+)\]/g)]
    .map((match) => match[1])
    .filter((id): id is string => Boolean(id));
  return citations.some((id) => ids.has(id));
}

export function suspectedRepoAreasFromEvidence(evidence: EvidenceItem[]): string[] {
  const areas = new Set<string>();
  for (const item of evidence) {
    if (!isRecord(item.raw)) continue;
    const values = item.raw.suspected_repo_areas;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        areas.add(value.trim());
      }
    }
  }
  return [...areas].sort();
}

export function buildHandoffPrompt(input: {
  evidence: EvidenceItem[];
  hypothesis: string;
  suspectedRepoAreas: string[];
  summary: string;
  title: string;
}): string {
  const evidenceLines = input.evidence.length
    ? input.evidence
        .map((item) => `- ${item.kind}:${item.id} (${item.link}) -- ${item.snippet}`)
        .join('\n')
    : '- No evidence items were attached; stop and ask Ram before changing code.';
  const repoAreas = input.suspectedRepoAreas.length
    ? input.suspectedRepoAreas.map((area) => `- ${area}`).join('\n')
    : '- None supplied by topology evidence.';

  return `# EduPod Incident Fix Handoff

## Mission

Investigate and fix the incident described below in the EduPod repository.

## Independent Verification / Falsification

The admin Copilot hypothesis is NOT authoritative. First gather repo context, logs, tests, and relevant source code. Independently verify or falsify the hypothesis before implementing. If your investigation reaches a different conclusion, stop and report the mismatch to Ram before making code changes.

## Incident Summary

- What is wrong: ${input.title}
- Current status: ${input.summary}

## Evidence From Admin Console

${evidenceLines}

## Copilot Hypothesis

${input.hypothesis}

## Suspected Repo Areas

These are starting points from the operator-maintained topology map, not proof:

${repoAreas}

## Expected Agent Workflow

1. Read AGENTS.md and required rule packs.
2. Inspect the suspected areas and related tests.
3. Reproduce or add a failing test where practical.
4. Decide whether the Copilot hypothesis is correct.
5. If correct: implement the minimal fix, run targeted tests, lint/type-check as needed, commit, push, watch CI, production-smoke.
6. If incorrect or incomplete: report the evidence and wait for Ram.

## Constraints

- Do not print or commit secrets.
- Do not edit production server files directly.
- Deploy only through CI.
- Stage only explicit files touched by the fix.
`;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(sk-[A-Za-z0-9_-]{20,})/g, '[REDACTED_SECRET]')
    .replace(/(password|secret|token|api[_-]?key)=([^\s]+)/gi, '$1=[REDACTED_SECRET]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/g, 'Bearer [REDACTED_SECRET]');
}

export function assertNoSecrets(value: string): void {
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /(password|secret|token|api[_-]?key)=([^\s]+)/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
  ];
  if (patterns.some((pattern) => pattern.test(value))) {
    throw new BadRequestException({
      code: 'HANDOFF_PROMPT_SECRET_PATTERN_DETECTED',
      message: 'The generated handoff prompt matched a secret pattern and was not stored.',
    });
  }
}

function readSilenceScope(
  payload: Record<string, unknown>,
): 'component' | 'global' | 'single_rule' {
  const scope = readString(payload, 'scope');
  if (scope === 'component' || scope === 'global' || scope === 'single_rule') return scope;
  if (readString(payload, 'component')) return 'component';
  if (readString(payload, 'alert_rule_id')) return 'single_rule';
  return 'global';
}

function readCacheType(
  payload: Record<string, unknown>,
): 'all' | 'domains' | 'modules' | 'permissions' {
  const value = readString(payload, 'cache_type') ?? 'all';
  if (value === 'permissions' || value === 'domains' || value === 'modules' || value === 'all') {
    return value;
  }
  return 'all';
}

function readAlertComponent(
  payload: Record<string, unknown>,
): 'bullmq' | 'disk' | 'meilisearch' | 'postgresql' | 'redis' | undefined {
  const value = readString(payload, 'component');
  if (
    value === 'bullmq' ||
    value === 'disk' ||
    value === 'meilisearch' ||
    value === 'postgresql' ||
    value === 'redis'
  ) {
    return value;
  }
  return undefined;
}

function readStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readDate(payload: Record<string, unknown>, key: string): Date | undefined {
  const value = payload[key];
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, jsonReplacer)) as Prisma.InputJsonValue;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
