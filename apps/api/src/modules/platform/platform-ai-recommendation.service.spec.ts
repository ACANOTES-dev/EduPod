import type Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PlatformAiRecommendationService } from './platform-ai-recommendation.service';

const NOW = new Date('2026-05-17T12:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

const evidenceItem = {
  id: 'queue-gradebook',
  kind: 'queue_state',
  link: '/admin/queues/gradebook',
  occurred_at: NOW.toISOString(),
  raw: { counts: { failed: 12 }, name: 'gradebook' },
  snippet: 'gradebook: 12 failed jobs',
};

function anthropicMessage(text: string): Anthropic.Message {
  return {
    id: 'msg-1',
    container: null,
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-6-20250514',
    role: 'assistant',
    stop_reason: 'end_turn',
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 10,
      input_tokens: 200,
      output_tokens: 80,
    },
  } as Anthropic.Message;
}

function recommendationJson(summary = 'Queue failures are clustered [E:queue-gradebook].') {
  return JSON.stringify({
    recommendations: [
      {
        category: 'known_fix',
        confidence: 'high',
        detailed_reasoning:
          'The gradebook queue has repeated failed jobs and should be checked against the cited queue evidence [E:queue-gradebook].',
        proposed_action: {
          action_type: 'manual_runbook_review',
          description: 'Review failed jobs manually before retrying.',
        },
        related_runbook_id: null,
        requires_owner_confirmation: false,
        requires_repo_agent_handoff: true,
        risk_level: 'caution',
        summary,
        target_resource_id: 'gradebook',
        target_resource_type: 'queue',
        target_tenant_id: null,
        title: 'Review gradebook queue failures',
      },
    ],
  });
}

function buildService(options?: {
  configured?: boolean;
  existingRecommendation?: Record<string, unknown> | null;
  modelOutput?: string;
}) {
  const conversation = {
    id: CONVERSATION_ID,
    conversation_type: 'recommendation',
    created_at: NOW,
    created_by_user_id: USER_ID,
    is_locked: false,
    last_message_at: NOW,
    locked_reason: null,
    title: null,
    total_cost_usd: new Prisma.Decimal(0),
    total_tokens_cached: 0,
    total_tokens_input: 0,
    total_tokens_output: 0,
  };
  const createdRecommendation = {
    id: 'recommendation-1',
    category: 'known_fix',
    confidence: 'high',
    detailed_reasoning: 'details',
    evidence: [evidenceItem],
    evidence_fingerprint: 'fingerprint',
    generated_at: NOW,
    generated_by_user_id: USER_ID,
    last_refreshed_at: NOW,
    raw_reasoning: 'raw',
    requires_owner_confirmation: false,
    requires_repo_agent_handoff: true,
    risk_level: 'caution',
    status: 'active',
    summary: 'summary',
    title: 'title',
  };
  const prisma = {
    platformAiConversation: {
      create: jest.fn().mockResolvedValue(conversation),
      update: jest.fn().mockResolvedValue(conversation),
    },
    platformAiMessage: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'message-1',
        created_at: NOW,
        ...data,
      })),
    },
    platformAiRecommendation: {
      create: jest.fn().mockResolvedValue(createdRecommendation),
      findFirst: jest.fn().mockResolvedValue(options?.existingRecommendation ?? null),
      findMany: jest.fn().mockResolvedValue([createdRecommendation]),
      findUnique: jest.fn().mockResolvedValue(createdRecommendation),
      update: jest.fn().mockResolvedValue({ ...createdRecommendation, id: 'recommendation-1' }),
    },
  };
  const evidence = {
    forAlert: jest.fn(),
    forCorrelationId: jest.fn(),
    forDeploy: jest.fn(),
    forErrorFingerprint: jest.fn(),
    forHealth: jest.fn(),
    forQueue: jest.fn().mockResolvedValue({ items: [evidenceItem] }),
    forTenant: jest.fn(),
    forTimeWindow: jest.fn().mockResolvedValue({ items: [evidenceItem] }),
    runbooksForAlert: jest.fn().mockResolvedValue([]),
    runbooksForError: jest.fn().mockResolvedValue([]),
    severityForEvidence: jest.fn().mockResolvedValue([]),
    topologyForEvidence: jest.fn().mockResolvedValue([]),
  };
  const configService = {
    get: jest.fn().mockReturnValue('claude-sonnet-4-6-20250514'),
  };
  const anthropic = {
    get isPlatformConfigured() {
      return options?.configured ?? true;
    },
    createPlatformMessage: jest
      .fn()
      .mockResolvedValue(anthropicMessage(options?.modelOutput ?? recommendationJson())),
  };
  const postProcessor = {
    process: jest.fn((raw: string, allowedIds: string[]) => {
      const citations = allowedIds.filter((id) => raw.includes(`[E:${id}]`));
      return {
        citations,
        stripped: citations.length > 0 ? raw : "I don't have enough cited evidence to answer that.",
        stripped_claims_count: citations.length > 0 ? 0 : 1,
      };
    }),
  };
  const costGuard = {
    applySpend: jest.fn().mockResolvedValue(undefined),
    assertCanSpend: jest.fn().mockResolvedValue(undefined),
    estimateCost: jest.fn().mockReturnValue(0.002),
  };
  const scanner = {
    scan: jest.fn().mockResolvedValue({ attempts: 1, flaggedEvidenceIds: ['queue-gradebook'] }),
  };
  const platformAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  return {
    anthropic,
    costGuard,
    evidence,
    prisma,
    scanner,
    service: new PlatformAiRecommendationService(
      prisma as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[0],
      configService as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[1],
      evidence as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[2],
      anthropic as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[3],
      postProcessor as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[4],
      costGuard as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[5],
      scanner as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[6],
      platformAudit as unknown as ConstructorParameters<typeof PlatformAiRecommendationService>[7],
    ),
  };
}

describe('PlatformAiRecommendationService', () => {
  afterEach(() => jest.clearAllMocks());

  it('generates cited manual recommendations from selected evidence', async () => {
    const { anthropic, costGuard, evidence, prisma, scanner, service } = buildService();

    const result = await service.generate({
      context: { id: 'gradebook', kind: 'queue' },
      trigger_source: 'recommendation_button',
      user_id: USER_ID,
    });

    expect(evidence.forQueue).toHaveBeenCalledWith('gradebook');
    expect(scanner.scan).toHaveBeenCalledWith(expect.arrayContaining([evidenceItem]));
    expect(anthropic.createPlatformMessage).toHaveBeenCalledTimes(1);
    expect(prisma.platformAiRecommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evidence: [evidenceItem],
        proposed_action: expect.objectContaining({ mode: 'manual_only' }),
        requires_repo_agent_handoff: true,
        target_resource_type: 'queue',
      }),
    });
    expect(costGuard.applySpend).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID }),
    );
    expect(result).toEqual(expect.objectContaining({ generated: 1, refreshed: 0, skipped: 0 }));
  });

  it('refreshes an active recommendation with the same evidence fingerprint', async () => {
    const { prisma, service } = buildService({
      existingRecommendation: { id: 'existing-recommendation' },
    });

    const result = await service.generate({
      context: { id: 'gradebook', kind: 'queue' },
      trigger_source: 'recommendation_button',
      user_id: USER_ID,
    });

    expect(prisma.platformAiRecommendation.create).not.toHaveBeenCalled();
    expect(prisma.platformAiRecommendation.update).toHaveBeenCalledWith({
      where: { id: 'existing-recommendation' },
      data: expect.objectContaining({ status: 'active' }),
    });
    expect(result.refreshed).toBe(1);
  });

  it('skips uncited recommendation claims before insert', async () => {
    const { prisma, service } = buildService({
      modelOutput: recommendationJson('Queue failures are clustered without a citation.'),
    });

    const result = await service.generate({
      context: { id: 'gradebook', kind: 'queue' },
      trigger_source: 'recommendation_button',
      user_id: USER_ID,
    });

    expect(prisma.platformAiRecommendation.create).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('blocks platform AI calls when the provider is not configured', async () => {
    const { service } = buildService({ configured: false });

    await expect(
      service.generate({
        context: { id: 'gradebook', kind: 'queue' },
        trigger_source: 'recommendation_button',
        user_id: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('generates an on-demand daily brief with citations and cost guardrails', async () => {
    const { costGuard, prisma, service } = buildService({
      modelOutput: 'Daily brief: gradebook needs attention [E:queue-gradebook].',
    });

    const result = await service.generateDailyBrief({ since_hours: 24, user_id: USER_ID });

    expect(prisma.platformAiRecommendation.create).not.toHaveBeenCalled();
    expect(costGuard.assertCanSpend).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(result.message.content).toContain('[E:queue-gradebook]');
  });
});
