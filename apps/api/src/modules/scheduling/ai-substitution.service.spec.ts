import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { AiSubstitutionService } from './ai-substitution.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHEDULE_ID = 'schedule-1';
const DATE = '2026-03-20';

const mockMessagesCreate = jest.fn();

const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue({ ai: { substitutionRankingEnabled: true } }),
};

const mockSchedule = {
  id: SCHEDULE_ID,
  teacher_staff_id: 'staff-1',
  weekday: 4,
  start_time: new Date('1970-01-01T09:00:00Z'),
  end_time: new Date('1970-01-01T10:00:00Z'),
  academic_year_id: 'ay-1',
  class_entity: {
    name: '10A',
    year_group_id: 'yg-1',
    subject_id: 'sub-1',
    academic_year_id: 'ay-1',
    subject: { name: 'Mathematics' },
    year_group: { name: 'Year 10' },
  },
  room: { name: 'Room 101' },
};

describe('AiSubstitutionService', () => {
  let service: AiSubstitutionService;
  let module: TestingModule;
  let mockPrisma: {
    schedule: { findFirst: jest.Mock; findMany: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    teacherCompetency: { findMany: jest.Mock };
    substitutionRecord: { findMany: jest.Mock };
  };

  let mockAnthropicClientService: { isConfigured: boolean; createMessage: jest.Mock };

  beforeEach(async () => {
    mockAnthropicClientService = {
      isConfigured: true,
      createMessage: mockMessagesCreate,
    };

    mockPrisma = {
      schedule: {
        findFirst: jest.fn().mockResolvedValue(mockSchedule),
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
          { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
        ]),
      },
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      substitutionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockSettingsService.getSettings.mockResolvedValue({ ai: { substitutionRankingEnabled: true } });

    module = await Test.createTestingModule({
      providers: [
        { provide: SchedulesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findCoreById: jest.fn().mockResolvedValue(null),
      existsById: jest.fn().mockResolvedValue(null),
      findBusyTeacherIds: jest.fn().mockResolvedValue(new Set()),
      countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
      findClassTimetable: jest.fn().mockResolvedValue([]),
      findPinnedEntries: jest.fn().mockResolvedValue([]),
      countPinnedEntries: jest.fn().mockResolvedValue(0),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findScheduledClassIds: jest.fn().mockResolvedValue([]),
      countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
      count: jest.fn().mockResolvedValue(0),
      hasRotationEntries: jest.fn().mockResolvedValue(false),
      countByRoom: jest.fn().mockResolvedValue(0),
      findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
      findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
      countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
      findByIdWithSwapContext: jest.fn().mockResolvedValue(null),
      hasConflict: jest.fn().mockResolvedValue(false),
      findByIdWithSubstitutionContext: jest.fn().mockResolvedValue(null),
      findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        AiSubstitutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<AiSubstitutionService>(AiSubstitutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── rankSubstitutes ──────────────────────────────────────────────────────

  describe('rankSubstitutes', () => {
    it('should return ranked substitutes from AI response', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 90,
                reasoning: 'Subject expert with low cover count',
              },
              {
                staff_profile_id: 'staff-3',
                confidence: 'medium',
                score: 70,
                reasoning: 'Available and fair workload',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.staff_profile_id).toBe('staff-2');
      expect(result.data[0]!.confidence).toBe('high');
      expect(result.data[0]!.score).toBe(90);
      expect(result.data[0]!.name).toBe('Jane Smith');
    });

    it('should sort results by score descending', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-3',
                confidence: 'low',
                score: 40,
                reasoning: 'Lower score',
              },
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 85,
                reasoning: 'Higher score',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data[0]!.score).toBeGreaterThan(result.data[1]!.score);
    });

    it('should clamp score to 0–100 range', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 150,
                reasoning: 'Too high',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data[0]!.score).toBe(100);
    });

    it('should fallback to low confidence for unknown confidence values', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'very_high',
                score: 80,
                reasoning: 'Unknown confidence',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data[0]!.confidence).toBe('low');
    });

    it('should return empty data when AI throws an error (graceful degradation)', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('should return empty data when AI returns malformed JSON', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('should return empty data when no available staff', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('should return empty data when schedule not found', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('should log AI processing to audit trail', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 90,
                reasoning: 'Subject expert with low cover count',
              },
            ]),
          },
        ],
      });

      await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      const mockAuditService = module.get(AiAuditService);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          aiService: 'ai_substitution',
          tokenised: true,
        }),
      );
    });

    it('should limit results to top 5', async () => {
      const candidates = Array.from({ length: 8 }, (_, i) => ({
        staff_profile_id: `staff-${i + 10}`,
        confidence: 'medium' as const,
        score: 50 + i,
        reasoning: `Candidate ${i}`,
      }));

      mockPrisma.staffProfile.findMany.mockResolvedValue(
        candidates.map((c) => ({
          id: c.staff_profile_id,
          user: { first_name: 'Teacher', last_name: `${c.staff_profile_id}` },
        })),
      );

      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(candidates) }],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── graceful degradation when SDK unavailable ────────────────────────────

  describe('graceful degradation', () => {
    it('should throw ServiceUnavailableException when ANTHROPIC_API_KEY is not set', async () => {
      mockAnthropicClientService.isConfigured = false;

      await expect(service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
