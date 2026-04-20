import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

import { BehaviourAiParseService } from './behaviour-ai-parse.service';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'user-1';

describe('BehaviourAiParseService', () => {
  let service: BehaviourAiParseService;
  let mockPrisma: {
    behaviourCategory: { findMany: jest.Mock };
  };
  let mockAnthropic: { isConfigured: boolean; createMessage: jest.Mock };
  let mockAiAudit: { log: jest.Mock };
  let mockStudentReadFacade: { findManyGeneric: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat-disruption', name: 'Disruption' },
          { id: 'cat-praise', name: 'Praise' },
        ]),
      },
    };

    mockStudentReadFacade = {
      findManyGeneric: jest.fn().mockResolvedValue([
        {
          id: 'student-1',
          first_name: 'Alice',
          middle_name: null,
          last_name: 'Brown',
        },
      ]),
    };

    mockAnthropic = { isConfigured: true, createMessage: jest.fn() };
    mockAiAudit = { log: jest.fn().mockResolvedValue('log-id') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAiParseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnthropicClientService, useValue: mockAnthropic },
        { provide: AiAuditService, useValue: mockAiAudit },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
      ],
    }).compile();
    service = module.get(BehaviourAiParseService);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws when the Anthropic provider is not configured', async () => {
    mockAnthropic.isConfigured = false;
    await expect(
      service.parse(TENANT, USER, 'Alice disrupted the class during maths'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('returns the expected shape when the LLM returns valid JSON', async () => {
    mockAnthropic.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            polarity: 'negative',
            severity: 'moderate',
            students: [{ name: 'Alice Brown', confidence: 0.9 }],
            when: '2026-04-20T09:00:00Z',
            location: 'Maths Room',
            category_hint: 'Disruption',
            confidence: 0.82,
          }),
        },
      ],
    });

    const result = await service.parse(
      TENANT,
      USER,
      'Alice Brown disrupted the maths class by shouting over the teacher for the third time this week.',
    );

    expect(result.suggested_polarity).toBe('negative');
    expect(result.suggested_severity).toBe('moderate');
    expect(result.suggested_category_id).toBe('cat-disruption');
    expect(result.suggested_students).toEqual([
      { id: 'student-1', full_name: 'Alice Brown', confidence: 0.9 },
    ]);
    expect(result.suggested_when).toBe('2026-04-20T09:00:00Z');
    expect(result.suggested_location).toBe('Maths Room');
    expect(result.confidence_score).toBe(0.82);
    expect(typeof result.raw_provider_response_id).toBe('string');
    expect(mockAiAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ aiService: 'ai_behaviour_parse' }),
    );
  });

  it('returns an empty result if the LLM output cannot be parsed', async () => {
    mockAnthropic.createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json' }],
    });
    const result = await service.parse(TENANT, USER, 'Some long enough incident description here.');
    expect(result.suggested_polarity).toBeNull();
    expect(result.suggested_students).toEqual([]);
    expect(result.confidence_score).toBe(0);
  });

  it('omits category when no hint maps to a known category', async () => {
    mockAnthropic.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            polarity: 'positive',
            severity: 'minor',
            students: [],
            when: null,
            location: null,
            category_hint: 'UnknownCategory',
            confidence: 0.3,
          }),
        },
      ],
    });
    const result = await service.parse(
      TENANT,
      USER,
      'An incident description that is long enough.',
    );
    expect(result.suggested_category_id).toBeNull();
  });
});
