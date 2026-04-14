import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
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
  class_id: 'class-1',
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
    substituteTeacherCompetency: { findMany: jest.Mock };
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
      substituteTeacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      substitutionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockSettingsService.getSettings.mockResolvedValue({ ai: { substitutionRankingEnabled: true } });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: SchedulesReadFacade,
          useValue: {
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
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
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
    beforeEach(() => {
      // Override facade mocks for tests that need schedule context
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());

      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
    });

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
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([]);

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('should return empty data when schedule not found', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(null);

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

      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue(
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

    it('should throw ServiceUnavailableException when AI feature is disabled in settings', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        ai: { substitutionRankingEnabled: false },
      });

      await expect(service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ─── competency map merging ──────────────────────────────────────────────

  describe('rankSubstitutes — competency map', () => {
    beforeEach(() => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());

      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
    });

    it('should clamp negative score to 0', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'low', score: -10, reasoning: 'Negative' },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data[0]!.score).toBe(0);
    });

    it('should use staff_profile_id as name when staff member not found in available list', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'unknown-staff',
                confidence: 'medium',
                score: 50,
                reasoning: 'Unknown',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data[0]!.name).toBe('unknown-staff');
    });

    it('should filter out invalid items from AI response', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'high', score: 80, reasoning: 'Valid' },
              { confidence: 'high', score: 80, reasoning: 'Missing staff_profile_id' },
              {
                staff_profile_id: 'staff-3',
                confidence: 'high',
                score: 'not-a-number',
                reasoning: 'Invalid score',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-2');
    });

    it('should handle AI response with non-text content type', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'image' }],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('edge: should skip competency query when no subject_id and no year_group_id', async () => {
      const schedNoSubject = {
        ...mockSchedule,
        class_entity: {
          ...mockSchedule.class_entity,
          subject_id: null,
          year_group_id: null,
        },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(schedNoSubject);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'medium', score: 60, reasoning: 'OK' },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.substituteTeacherCompetency.findMany).not.toHaveBeenCalled();
    });

    // Two tests about merging is_primary across duplicate competency rows were
    // removed in Stage 1 of the scheduler rebuild — the column was dropped.
    // Stage 7 will reinstate a primary-vs-secondary signal against the new
    // substitute_teacher_competencies table, and those tests will return then.

    it('should use schedule.academic_year_id when class_entity has no academic_year_id', async () => {
      const schedNoAy = {
        ...mockSchedule,
        academic_year_id: 'fallback-ay',
        class_entity: {
          ...mockSchedule.class_entity,
          academic_year_id: undefined,
        },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(schedNoAy);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'medium', score: 60, reasoning: 'OK' },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
      // Competency query should use fallback-ay
      expect(mockPrisma.substituteTeacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ academic_year_id: 'fallback-ay' }),
        }),
      );
    });

    it('should exclude the absent teacher from available staff', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      // Include the original teacher in the active staff list
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Absent', last_name: 'Teacher' } },
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 90,
                reasoning: 'Available',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      // Only staff-2 should be in results (staff-1 is the absent teacher)
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-2');
    });

    it('should exclude busy teachers from available staff', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set(['staff-2']));

      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-3',
                confidence: 'medium',
                score: 70,
                reasoning: 'Only available',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-3');
    });

    it('should accumulate cover counts from substitution records', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-3' },
      ]);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'medium',
                score: 60,
                reasoning: 'Higher cover',
              },
              {
                staff_profile_id: 'staff-3',
                confidence: 'high',
                score: 80,
                reasoning: 'Lower cover',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      // Should be sorted by score descending
      expect(result.data[0]!.staff_profile_id).toBe('staff-3');
      expect(result.data[1]!.staff_profile_id).toBe('staff-2');
    });

    it('edge: should handle AI response with empty content array', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('edge: should handle AI response with content[0] that has empty text', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '' }],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(0);
    });

    it('should skip the competency lookup when year_group_id is null', async () => {
      // Stage 8: substitute competencies are keyed by (subject, year_group),
      // so if either is missing the AI ranker treats everyone as "generally
      // competent" and leaves is_primary/is_competent inferred at the prompt
      // level. The DB query is skipped entirely.
      const schedWithSubjectOnly = {
        ...mockSchedule,
        class_entity: {
          ...mockSchedule.class_entity,
          year_group_id: null,
        },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(
        schedWithSubjectOnly,
      );

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'medium', score: 60, reasoning: 'OK' },
            ]),
          },
        ],
      });

      await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(mockPrisma.substituteTeacherCompetency.findMany).not.toHaveBeenCalled();
    });

    it('should skip the competency lookup when subject_id is null', async () => {
      const schedWithYgOnly = {
        ...mockSchedule,
        class_entity: {
          ...mockSchedule.class_entity,
          subject_id: null,
        },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(schedWithYgOnly);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'medium', score: 60, reasoning: 'OK' },
            ]),
          },
        ],
      });

      await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(mockPrisma.substituteTeacherCompetency.findMany).not.toHaveBeenCalled();
    });

    it('should use fallback name when tokenised name not found for staff', async () => {
      // Override gdprTokenService to return empty entities
      const gdprService = module.get(GdprTokenService);
      (gdprService.processOutbound as jest.Mock).mockResolvedValue({
        processedData: { entities: [], entityCount: 0 },
        tokenMap: new Map(),
      });

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'high', score: 80, reasoning: 'Good' },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe('Jane Smith');
    });

    it('should handle schedule with null room in prompt context', async () => {
      const schedNoRoom = {
        ...mockSchedule,
        room: null,
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(schedNoRoom);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'medium',
                score: 70,
                reasoning: 'No room',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      expect(result.data).toHaveLength(1);
    });

    it('should use full_name from tokenisedNameMap when entity has null full_name', async () => {
      const gdprService = module.get(GdprTokenService);
      (gdprService.processOutbound as jest.Mock).mockResolvedValue({
        processedData: {
          entities: [
            { id: 'staff-2', fields: { full_name: null } },
            { id: 'staff-3', fields: { full_name: null } },
          ],
          entityCount: 2,
        },
        tokenMap: new Map(),
      });

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { staff_profile_id: 'staff-2', confidence: 'medium', score: 70, reasoning: 'OK' },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      // Should use tokenised name (empty string since full_name ?? '' = '')
      expect(result.data).toHaveLength(1);
    });

    it('should handle schedule with entirely null class_entity in prompt context', async () => {
      const schedNullClassEntity = {
        ...mockSchedule,
        class_entity: null,
        room: null,
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(
        schedNullClassEntity,
      );

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'medium',
                score: 50,
                reasoning: 'No context',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      // Should not crash; uses 'Unknown' for subject/year/class, 'TBD' for room
      expect(result.data).toHaveLength(1);
    });

    it('should handle is_competent=true for all staff when no subject_id', async () => {
      const schedNoSubject = {
        ...mockSchedule,
        class_entity: {
          ...mockSchedule.class_entity,
          subject_id: null,
          year_group_id: null,
          subject: { name: 'Unknown' },
          year_group: { name: 'Unknown' },
        },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(schedNoSubject);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                staff_profile_id: 'staff-2',
                confidence: 'high',
                score: 90,
                reasoning: 'All competent',
              },
            ]),
          },
        ],
      });

      const result = await service.rankSubstitutes(TENANT_ID, SCHEDULE_ID, DATE);

      // All staff should be considered competent when there's no subject
      expect(result.data).toHaveLength(1);
    });
  });
});
