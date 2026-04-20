import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

import { BehaviourAiSummaryService } from './behaviour-ai-summary.service';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT = 'ssssssss-ssss-ssss-ssss-ssssssssssss';

const LLM_BODY = JSON.stringify({
  summary_paragraph: 'The student shows improving positive behaviour over the last 8 weeks.',
  highlights: [
    { kind: 'trend', title: 'Improving trend', detail: 'Negative incidents down 20%.' },
    { kind: 'recognition', title: 'Awarded 3 house points', detail: 'This term.' },
  ],
});

describe('BehaviourAiSummaryService', () => {
  let service: BehaviourAiSummaryService;
  let mockStudentReadFacade: { exists: jest.Mock };
  let mockAnthropic: { isConfigured: boolean; createMessage: jest.Mock };
  let mockAiAudit: { log: jest.Mock };
  let mockPrisma: {
    behaviourIncidentParticipant: { findMany: jest.Mock };
    behaviourIntervention: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockStudentReadFacade = { exists: jest.fn().mockResolvedValue(true) };
    mockAnthropic = {
      isConfigured: true,
      createMessage: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: LLM_BODY }],
      }),
    };
    mockAiAudit = { log: jest.fn().mockResolvedValue('log-id') };
    mockPrisma = {
      behaviourIncidentParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourIntervention: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAiSummaryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnthropicClientService, useValue: mockAnthropic },
        { provide: AiAuditService, useValue: mockAiAudit },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
      ],
    }).compile();

    service = module.get(BehaviourAiSummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws 404 when the student does not exist', async () => {
    mockStudentReadFacade.exists.mockResolvedValueOnce(false);
    await expect(service.getSummary(TENANT, STUDENT)).rejects.toThrow(NotFoundException);
  });

  it('throws service unavailable when the LLM is not configured', async () => {
    mockAnthropic.isConfigured = false;
    await expect(service.getSummary(TENANT, STUDENT)).rejects.toThrow(ServiceUnavailableException);
  });

  it('returns a parsed summary with cached=false on first call', async () => {
    const result = await service.getSummary(
      TENANT,
      STUDENT,
      undefined,
      undefined,
      1_700_000_000_000,
    );
    expect(result.student_id).toBe(STUDENT);
    expect(result.summary_paragraph).toContain('improving');
    expect(result.highlights).toHaveLength(2);
    expect(result.cached).toBe(false);
    expect(mockAiAudit.log).toHaveBeenCalled();
  });

  it('returns cached=true on the second call within the 24h window', async () => {
    const t1 = 1_700_000_000_000;
    const first = await service.getSummary(TENANT, STUDENT, undefined, undefined, t1);
    expect(first.cached).toBe(false);
    const second = await service.getSummary(TENANT, STUDENT, undefined, undefined, t1 + 60_000);
    expect(second.cached).toBe(true);
    expect(mockAnthropic.createMessage).toHaveBeenCalledTimes(1);
  });

  it('recomputes after 24h', async () => {
    const t1 = 1_700_000_000_000;
    await service.getSummary(TENANT, STUDENT, undefined, undefined, t1);
    const t2 = t1 + 25 * 60 * 60 * 1000;
    const later = await service.getSummary(TENANT, STUDENT, undefined, undefined, t2);
    expect(later.cached).toBe(false);
    expect(mockAnthropic.createMessage).toHaveBeenCalledTimes(2);
  });

  it('returns empty result shape if LLM output is invalid JSON', async () => {
    mockAnthropic.createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json' }],
    });
    const result = await service.getSummary(TENANT, STUDENT);
    expect(result.summary_paragraph).toBe('');
    expect(result.highlights).toEqual([]);
  });
});
