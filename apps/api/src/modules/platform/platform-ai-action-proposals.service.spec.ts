import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformAuditAction, Prisma } from '@prisma/client';

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn(
    async (_prisma: unknown, _context: unknown, callback: (tx: unknown) => Promise<unknown>) =>
      callback(_prisma),
  ),
}));

import { PlatformAiActionProposalsService } from './platform-ai-action-proposals.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECOMMENDATION_ID = '22222222-2222-4222-8222-222222222222';
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-05-17T12:00:00.000Z');

const audit = {
  actor_user_id: USER_ID,
  ip_address: '127.0.0.1',
  user_agent: 'jest',
};

const evidenceItem = {
  id: 'queue-gradebook',
  kind: 'queue_state',
  link: '/admin/queues/gradebook',
  occurred_at: NOW.toISOString(),
  raw: {
    name: 'gradebook',
    suspected_repo_areas: ['apps/api/src/modules/gradebook'],
  },
  snippet: 'gradebook queue has failed jobs',
};

const recommendation = {
  id: RECOMMENDATION_ID,
  category: 'known_fix',
  confidence: 'high',
  detailed_reasoning: 'Retry the failed queue jobs after checking the runbook [E:queue-gradebook].',
  evidence: [evidenceItem],
  evidence_fingerprint: 'fingerprint',
  expires_at: new Date('2026-05-18T12:00:00.000Z'),
  generated_at: NOW,
  generated_by_user_id: USER_ID,
  last_refreshed_at: NOW,
  proposed_action: {
    action_kind: 'retry_jobs',
    job_ids: ['job-1'],
    queue: 'gradebook',
  },
  raw_reasoning: 'raw',
  related_runbook_id: null,
  requires_owner_confirmation: false,
  requires_repo_agent_handoff: false,
  resolution_reason: null,
  resolution_type: null,
  resolved_at: null,
  resolved_by_user_id: null,
  risk_level: 'caution',
  status: 'active',
  summary: 'The gradebook queue has repeated failures [E:queue-gradebook].',
  target_resource_id: 'gradebook',
  target_resource_type: 'queue',
  target_tenant_id: null,
  title: 'Retry gradebook jobs',
  trigger_source: 'recommendation_button',
};

const proposal = {
  id: PROPOSAL_ID,
  action_kind: 'retry_jobs',
  action_payload: { job_ids: ['job-1'], queue: 'gradebook' },
  approved_at: null,
  approved_by_user_id: null,
  evidence: [evidenceItem],
  executed_at: null,
  execution_failed_at: null,
  execution_result: null,
  expires_at: new Date('2026-05-18T12:00:00.000Z'),
  owner_confirmation_id: null,
  proposed_at: NOW,
  proposed_by: 'recommendation_engine',
  reasoning: recommendation.summary,
  recommendation_id: RECOMMENDATION_ID,
  rejected_at: null,
  rejected_by_user_id: null,
  rejection_reason: null,
  required_permission: 'platform.queues.retry',
  requires_owner_confirmation: false,
  status: 'awaiting_approval',
  target_resource_id: 'gradebook',
  target_resource_type: 'queue',
  target_tenant_id: null,
};

function buildService(overrides?: {
  proposalOverride?: Record<string, unknown>;
  recommendationOverride?: Record<string, unknown>;
}) {
  const proposalRow = { ...proposal, ...overrides?.proposalOverride };
  const recommendationRow = { ...recommendation, ...overrides?.recommendationOverride };
  const prisma = {
    platformAgentHandoffPrompt: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'handoff-1',
        created_at: NOW,
        ...data,
      })),
      findUnique: jest.fn().mockResolvedValue({ id: 'handoff-1' }),
    },
    platformAiActionProposal: {
      create: jest.fn().mockResolvedValue(proposalRow),
      findMany: jest.fn().mockResolvedValue([proposalRow]),
      findUnique: jest.fn().mockResolvedValue(proposalRow),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...proposalRow,
        ...data,
      })),
    },
    platformAiRecommendation: {
      findUnique: jest.fn().mockResolvedValue(recommendationRow),
    },
    tenantDomain: { findMany: jest.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const platformUsers = {
    hasPermission: jest.fn().mockResolvedValue(true),
  };
  const platformAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const evidence = {
    forQueue: jest.fn().mockResolvedValue({ items: [evidenceItem] }),
    forTenant: jest.fn(),
    forAlert: jest.fn(),
  };
  const alertHistory = {
    acknowledge: jest.fn().mockResolvedValue({ id: 'alert-1', status: 'acknowledged' }),
  };
  const alertSilence = {
    create: jest.fn().mockResolvedValue({ id: 'silence-1' }),
  };
  const maintenance = {
    create: jest.fn().mockResolvedValue({ id: 'maintenance-1' }),
  };
  const queueManagement = {
    retryJob: jest.fn().mockResolvedValue({ retried: true }),
  };
  const ownerConfirmation = {
    confirmAndExecute: jest.fn().mockResolvedValue({
      confirmation_id: 'confirmation-1',
      execution_status: 'executed',
    }),
  };
  const redis = {
    getClient: jest.fn().mockReturnValue({ del: jest.fn().mockResolvedValue(0) }),
  };

  return {
    alertHistory,
    alertSilence,
    evidence,
    maintenance,
    ownerConfirmation,
    platformAudit,
    platformUsers,
    prisma,
    queueManagement,
    redis,
    service: new PlatformAiActionProposalsService(
      prisma as never,
      platformUsers as never,
      platformAudit as never,
      evidence as never,
      alertHistory as never,
      alertSilence as never,
      maintenance as never,
      queueManagement as never,
      ownerConfirmation as never,
      redis as never,
    ),
  };
}

describe('PlatformAiActionProposalsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a supervised proposal only from cited recommendation evidence', async () => {
    const { evidence, platformAudit, prisma, service } = buildService();

    const result = await service.create({ recommendation_id: RECOMMENDATION_ID }, USER_ID, audit);

    expect(evidence.forQueue).toHaveBeenCalledWith('gradebook');
    expect(prisma.platformAiActionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_kind: 'retry_jobs',
        required_permission: 'platform.queues.retry',
        requires_owner_confirmation: false,
      }),
    });
    expect(platformAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: PlatformAuditAction.ai_action_proposed }),
    );
    expect(result.id).toBe(PROPOSAL_ID);
  });

  it('checks AI approval and underlying action permission at approval time', async () => {
    const { platformUsers, queueManagement, service } = buildService();

    await service.approve(PROPOSAL_ID, { reason: 'Retry the cited failed job.' }, USER_ID, audit);

    expect(platformUsers.hasPermission).toHaveBeenCalledWith(USER_ID, 'platform.ai.approve_action');
    expect(platformUsers.hasPermission).toHaveBeenCalledWith(USER_ID, 'platform.queues.retry');
    expect(queueManagement.retryJob).toHaveBeenCalledWith('gradebook', 'job-1');
  });

  it('rejects a proposal and records the operator as the rejecter', async () => {
    const { platformAudit, prisma, service } = buildService();

    const result = await service.reject(
      PROPOSAL_ID,
      { reason: 'Evidence is stale after manual remediation.' },
      USER_ID,
      audit,
    );

    expect(prisma.platformAiActionProposal.update).toHaveBeenCalledWith({
      where: { id: PROPOSAL_ID },
      data: expect.objectContaining({
        rejected_by_user_id: USER_ID,
        rejection_reason: 'Evidence is stale after manual remediation.',
        status: 'rejected',
      }),
    });
    expect(platformAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: PlatformAuditAction.ai_action_rejected }),
    );
    expect(result.status).toBe('rejected');
  });

  it('requires both AI approval and the underlying action permission', async () => {
    const { platformUsers, service } = buildService();
    platformUsers.hasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      service.approve(PROPOSAL_ID, { reason: 'Retry the cited failed job.' }, USER_ID, audit),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an approval reason for non-owner-confirmed actions', async () => {
    const { service } = buildService();

    await expect(service.approve(PROPOSAL_ID, {}, USER_ID, audit)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks failed executor results without throwing after approval', async () => {
    const { queueManagement, service } = buildService();
    queueManagement.retryJob.mockRejectedValueOnce(new Error('retry refused'));

    const result = await service.approve(
      PROPOSAL_ID,
      { reason: 'Retry the cited failed job.' },
      USER_ID,
      audit,
    );

    expect(result.status).toBe('executed');
    expect(result.execution_result).toEqual({
      failed: [{ error: 'retry refused', job_id: 'job-1' }],
      queue: 'gradebook',
      retried: [],
    });
  });

  it('requires owner confirmation for destructive proposals without two-person approval', async () => {
    const { ownerConfirmation, service } = buildService({
      proposalOverride: {
        action_kind: 'clean_queue',
        action_payload: { limit: 10, queue: 'gradebook', status: 'failed' },
        required_permission: 'platform.queues.clean',
        requires_owner_confirmation: true,
      },
    });

    await expect(
      service.approve(PROPOSAL_ID, { reason: 'Clean failed queue entries.' }, USER_ID, audit),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.approve(
      PROPOSAL_ID,
      {
        owner_confirmation: {
          confirmation_phrase: 'APPROVE CLEAN_QUEUE',
          reason: 'Clean failed queue entries.',
          typed_confirmation: 'APPROVE CLEAN_QUEUE',
        },
      },
      USER_ID,
      audit,
    );

    expect(ownerConfirmation.confirmAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PlatformAuditAction.queue_cleaned,
        payload: { limit: 10, queue: 'gradebook', status: 'failed' },
      }),
      USER_ID,
      audit,
    );
  });

  it('executes alert silence and alert acknowledgement proposals', async () => {
    const { alertHistory, alertSilence, service } = buildService({
      proposalOverride: {
        action_kind: 'silence_alert',
        action_payload: {
          alert_rule_id: 'rule-1',
          component: 'redis',
          ends_at: '2026-05-17T13:00:00.000Z',
          reason: 'Evidence-backed temporary silence.',
          scope: 'single_rule',
          starts_at: '2026-05-17T12:00:00.000Z',
        },
        required_permission: 'platform.alerts.silence',
        target_resource_id: 'rule-1',
        target_resource_type: 'alert',
      },
      recommendationOverride: {
        target_resource_id: 'rule-1',
        target_resource_type: 'alert',
      },
    });

    await service.approve(
      PROPOSAL_ID,
      { reason: 'Silence the cited noisy alert.' },
      USER_ID,
      audit,
    );

    expect(alertSilence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_rule_id: 'rule-1',
        component: 'redis',
        scope: 'single_rule',
      }),
      USER_ID,
      audit,
    );

    const ack = buildService({
      proposalOverride: {
        action_kind: 'acknowledge_alert',
        action_payload: { alert_id: 'alert-1' },
        required_permission: 'platform.alerts.acknowledge',
        target_resource_id: 'alert-1',
        target_resource_type: 'alert',
      },
      recommendationOverride: {
        target_resource_id: 'alert-1',
        target_resource_type: 'alert',
      },
    });

    await ack.service.approve(
      PROPOSAL_ID,
      { reason: 'Acknowledge the cited alert.' },
      USER_ID,
      audit,
    );

    expect(ack.alertHistory.acknowledge).toHaveBeenCalledWith('alert-1', USER_ID, audit);
    expect(alertHistory.acknowledge).not.toHaveBeenCalled();
  });

  it('executes maintenance scheduling and tenant cache flush proposals', async () => {
    const { maintenance, service } = buildService({
      proposalOverride: {
        action_kind: 'schedule_maintenance',
        action_payload: {
          description: 'Investigate with operators available.',
          ends_at: '2026-05-17T14:00:00.000Z',
          starts_at: '2026-05-17T13:00:00.000Z',
          title: 'Queue remediation',
        },
        required_permission: 'platform.maintenance.toggle',
      },
    });

    await service.approve(
      PROPOSAL_ID,
      { reason: 'Schedule a short supervised maintenance window.' },
      USER_ID,
      audit,
    );

    expect(maintenance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Investigate with operators available.',
        title: 'Queue remediation',
      }),
      USER_ID,
      audit,
    );

    const cache = buildService({
      proposalOverride: {
        action_kind: 'flush_tenant_cache',
        action_payload: { cache_type: 'all', tenant_id: 'tenant-1' },
        required_permission: 'platform.cache.flush_tenant',
        target_tenant_id: 'tenant-1',
      },
    });
    cache.prisma.tenantMembership.findMany.mockResolvedValue([{ id: 'membership-1' }]);
    cache.prisma.tenantDomain.findMany.mockResolvedValue([{ domain: 'tenant.example.test' }]);
    cache.redis.getClient().del.mockResolvedValue(2);

    const result = await cache.service.approve(
      PROPOSAL_ID,
      { reason: 'Flush tenant cache after cited module drift.' },
      USER_ID,
      audit,
    );

    expect(result.execution_result).toEqual({
      cache_type: 'all',
      keys_deleted: 6,
      tenant_id: 'tenant-1',
    });
  });

  it('keeps GitHub, Sentry, repo handoff, and manual-only actions as supervised records', async () => {
    const github = buildService({
      proposalOverride: {
        action_kind: 'open_github_issue',
        action_payload: { title: 'Follow up cited incident' },
        required_permission: 'platform.ai.approve_action',
      },
    });

    const githubResult = await github.service.approve(
      PROPOSAL_ID,
      { reason: 'Create a draft issue body only.' },
      USER_ID,
      audit,
    );
    expect(githubResult.execution_result).toEqual(
      expect.objectContaining({ draft_only: true, issue_title: 'Follow up cited incident' }),
    );

    const sentry = buildService({
      proposalOverride: {
        action_kind: 'run_sentry_triage',
        action_payload: { issue: 'EDUPOD-1' },
        required_permission: 'platform.audit_log.view',
      },
    });
    const sentryResult = await sentry.service.approve(
      PROPOSAL_ID,
      { reason: 'Generate Sentry runbook handoff only.' },
      USER_ID,
      audit,
    );
    expect(sentryResult.execution_result).toEqual(
      expect.objectContaining({
        guardrails_preserved: true,
        runbook: 'docs/runbooks/agent-sentry-triage.md',
      }),
    );

    const handoff = buildService({
      proposalOverride: {
        action_kind: 'generate_repo_agent_handoff',
        action_payload: {},
        required_permission: 'platform.ai.read',
      },
    });
    await handoff.service.approve(
      PROPOSAL_ID,
      { reason: 'Generate handoff from cited evidence.' },
      USER_ID,
      audit,
    );
    expect(handoff.prisma.platformAgentHandoffPrompt.create).toHaveBeenCalled();

    const manual = buildService({
      proposalOverride: {
        action_kind: 'manual_only',
        action_payload: {},
        required_permission: 'platform.ai.read',
      },
    });
    const manualResult = await manual.service.approve(
      PROPOSAL_ID,
      { reason: 'Record a manual-only supervised action.' },
      USER_ID,
      audit,
    );
    expect(manualResult.execution_result).toEqual(
      expect.objectContaining({ manual_only: true, proposal_id: PROPOSAL_ID }),
    );
  });

  it('hard-blocks schema, migration, secret, deploy config, cron, and module registry actions', async () => {
    const { platformAudit, service } = buildService({
      recommendationOverride: {
        proposed_action: { action_kind: 'edit_schema', file: 'packages/prisma/schema.prisma' },
      },
    });

    await expect(
      service.create({ recommendation_id: RECOMMENDATION_ID }, USER_ID, audit),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(platformAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: PlatformAuditAction.ai_action_rejected }),
    );
  });

  it('generates repo-agent handoff prompts with verification instructions and no secrets', async () => {
    const { prisma, service } = buildService({
      recommendationOverride: {
        proposed_action: Prisma.JsonNull,
        requires_repo_agent_handoff: true,
      },
    });

    const handoff = await service.createHandoff(
      { recommendation_id: RECOMMENDATION_ID },
      USER_ID,
      audit,
    );

    expect(handoff.prompt_markdown).toContain('Independently verify or falsify');
    expect(handoff.prompt_markdown).toContain('Do not print or commit secrets');
    expect(handoff.prompt_markdown).not.toContain('sk-');
    expect(prisma.platformAgentHandoffPrompt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        suspected_repo_areas: ['apps/api/src/modules/gradebook'],
      }),
    });
  });
});
