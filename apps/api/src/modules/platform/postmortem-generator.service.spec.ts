import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { ErrorRedactorService } from '../platform-error-log/error-redactor.service';
import { PrismaService } from '../prisma/prisma.service';

import { CopilotInjectionScanner } from './copilot-injection-scanner';
import { CopilotResponsePostProcessor } from './copilot-response-post-processor';
import { PlatformAiCostGuardService } from './platform-ai-cost-guard.service';
import { PlatformEvidenceService } from './platform-evidence.service';
import { PlatformIncidentService } from './platform-incident.service';
import { PostmortemGeneratorService } from './postmortem-generator.service';

const INCIDENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';

function buildIncident(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INCIDENT_ID,
    affected_components: ['redis'],
    affected_tenants: [],
    auto_resolved: false,
    created_at: new Date('2026-05-17T10:00:00.000Z'),
    postmortem_draft: null,
    postmortem_final: null,
    postmortem_generated_at: null,
    postmortem_generations: 0,
    prevention_recommendation_ids: [],
    resolved_at: new Date('2026-05-17T10:30:00.000Z'),
    resolved_by_user_id: USER_ID,
    root_cause_summary: null,
    seed_alert_history_id: EVIDENCE_ID,
    severity: 'critical',
    started_at: new Date('2026-05-17T10:00:00.000Z'),
    status: 'resolved',
    title: 'Redis degraded',
    updated_at: new Date('2026-05-17T10:30:00.000Z'),
    ...overrides,
  };
}

function buildMockPrisma() {
  return {
    platformAiConversation: {
      create: jest.fn(),
      update: jest.fn(),
    },
    platformAiMessage: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    platformAiRecommendation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    platformIncident: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('PostmortemGeneratorService', () => {
  let service: PostmortemGeneratorService;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let anthropic: { createPlatformMessage: jest.Mock; isPlatformConfigured: boolean };
  let costGuard: {
    applySpend: jest.Mock;
    assertCanSpend: jest.Mock;
    estimateCost: jest.Mock;
  };
  let evidence: {
    forIncident: jest.Mock;
    forTimeWindow: jest.Mock;
    severityForEvidence: jest.Mock;
    topologyForEvidence: jest.Mock;
  };
  let incidents: { linkPreventionRecommendations: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
    prisma = buildMockPrisma();
    anthropic = {
      createPlatformMessage: jest.fn(),
      isPlatformConfigured: true,
    };
    costGuard = {
      applySpend: jest.fn().mockResolvedValue(undefined),
      assertCanSpend: jest.fn().mockResolvedValue(undefined),
      estimateCost: jest.fn().mockReturnValue(0.012),
    };
    evidence = {
      forIncident: jest.fn(),
      forTimeWindow: jest.fn(),
      severityForEvidence: jest.fn(),
      topologyForEvidence: jest.fn(),
    };
    incidents = { linkPreventionRecommendations: jest.fn().mockResolvedValue(buildIncident()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostmortemGeneratorService,
        CopilotResponsePostProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: AnthropicClientService, useValue: anthropic },
        { provide: ErrorRedactorService, useValue: { redact: jest.fn(redactFakeEmail) } },
        { provide: PlatformAiCostGuardService, useValue: costGuard },
        {
          provide: CopilotInjectionScanner,
          useValue: { scan: jest.fn().mockResolvedValue({ attempts: 0 }) },
        },
        { provide: PlatformEvidenceService, useValue: evidence },
        { provide: PlatformIncidentService, useValue: incidents },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(PostmortemGeneratorService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('generates a cited and redacted postmortem only when requested', async () => {
    const incident = buildIncident();
    prisma.platformIncident.findUnique.mockResolvedValueOnce(incident);
    prisma.platformAiConversation.create.mockResolvedValueOnce({ id: 'conversation-1' });
    prisma.platformAiMessage.create.mockResolvedValue({});
    evidence.forIncident.mockResolvedValueOnce({
      items: [
        {
          id: EVIDENCE_ID,
          kind: 'incident',
          link: '/admin/incidents/1',
          occurred_at: '2026-05-17T10:00:00.000Z',
          raw: {},
          snippet: 'Incident',
        },
      ],
    });
    evidence.forTimeWindow.mockResolvedValueOnce({ items: [] });
    evidence.topologyForEvidence.mockResolvedValueOnce([]);
    evidence.severityForEvidence.mockResolvedValueOnce([]);
    anthropic.createPlatformMessage.mockResolvedValueOnce({
      content: [
        {
          text: `# Redis degraded [E:${EVIDENCE_ID}]\n\n## Summary\nRedis failed for test@example.com [E:${EVIDENCE_ID}]\n\n## Root cause\nThe evidence points to Redis degradation [E:${EVIDENCE_ID}].\n\n## Prevention items\nPROPOSAL: Add a regression test. Rationale: coverage was missing. Risk: safe. [E:${EVIDENCE_ID}]`,
          type: 'text',
        },
      ],
      usage: {
        cache_read_input_tokens: 10,
        input_tokens: 100,
        output_tokens: 50,
      },
    });
    prisma.platformIncident.update.mockResolvedValueOnce({
      ...incident,
      postmortem_draft: 'redacted',
    });

    await service.generate(INCIDENT_ID, USER_ID);

    expect(anthropic.createPlatformMessage).toHaveBeenCalledTimes(1);
    expect(prisma.platformIncident.update).toHaveBeenCalledWith({
      where: { id: INCIDENT_ID },
      data: expect.objectContaining({
        postmortem_draft: expect.stringContaining('[EMAIL]'),
        postmortem_generations: { increment: 1 },
      }),
    });
    expect(costGuard.assertCanSpend).toHaveBeenCalledWith('conversation-1');
    expect(costGuard.applySpend).toHaveBeenCalled();
  });

  it('rate-limits regeneration to one postmortem per incident per hour', async () => {
    prisma.platformIncident.findUnique.mockResolvedValueOnce(
      buildIncident({ postmortem_generated_at: new Date('2026-05-17T11:30:00.000Z') }),
    );

    await expect(service.generate(INCIDENT_ID, USER_ID)).rejects.toBeInstanceOf(HttpException);
    expect(anthropic.createPlatformMessage).not.toHaveBeenCalled();
  });

  it('creates linked 4C prevention recommendation rows without applying changes', async () => {
    prisma.platformIncident.findUnique.mockResolvedValueOnce(
      buildIncident({
        postmortem_final: `## Prevention items\nPROPOSAL: Update runbook docs/runbooks/redis.md. Rationale: add this case. Risk: safe. [E:${EVIDENCE_ID}]`,
      }),
    );
    evidence.forIncident.mockResolvedValueOnce({
      items: [
        {
          id: EVIDENCE_ID,
          kind: 'incident',
          link: '/admin/incidents/1',
          occurred_at: '2026-05-17T10:00:00.000Z',
          raw: {},
          snippet: 'Incident',
        },
      ],
    });
    evidence.forTimeWindow.mockResolvedValueOnce({ items: [] });
    evidence.topologyForEvidence.mockResolvedValueOnce([]);
    evidence.severityForEvidence.mockResolvedValueOnce([]);
    prisma.platformAiRecommendation.findFirst.mockResolvedValueOnce(null);
    prisma.platformAiRecommendation.create.mockResolvedValueOnce({ id: 'recommendation-1' });

    await expect(service.generatePreventionRecommendations(INCIDENT_ID, USER_ID)).resolves.toEqual({
      recommendation_ids: ['recommendation-1'],
      recommendations_created: 1,
    });

    expect(prisma.platformAiRecommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposed_action: expect.objectContaining({ mode: 'manual_only' }),
        target_resource_id: INCIDENT_ID,
        target_resource_type: 'platform_incident',
      }),
    });
    expect(incidents.linkPreventionRecommendations).toHaveBeenCalledWith(INCIDENT_ID, [
      'recommendation-1',
    ]);
    expect(anthropic.createPlatformMessage).not.toHaveBeenCalled();
  });
});

function redactFakeEmail(input: string) {
  return Promise.resolve({
    redacted: input.replace(/test@example\.com/g, '[EMAIL]'),
    rules_applied: ['email'],
  });
}
