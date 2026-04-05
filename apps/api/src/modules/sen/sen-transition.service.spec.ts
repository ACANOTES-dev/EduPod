import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { SenScopeService } from './sen-scope.service';
import { SenTransitionService } from './sen-transition.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROFILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('SenTransitionService', () => {
  let service: SenTransitionService;

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const senTransitionNoteMock = {
    create: jest.fn(),
    findMany: jest.fn(),
  };

  const senSupportPlanMock = {
    findFirst: jest.fn(),
  };

  const senAccommodationMock = {
    findMany: jest.fn(),
  };

  const senProfessionalInvolvementMock = {
    findMany: jest.fn(),
  };

  const senStudentHoursMock = {
    findMany: jest.fn(),
  };

  const senSnaAssignmentMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senProfile: senProfileMock,
    senTransitionNote: senTransitionNoteMock,
    senSupportPlan: senSupportPlanMock,
    senAccommodation: senAccommodationMock,
    senProfessionalInvolvement: senProfessionalInvolvementMock,
    senStudentHours: senStudentHoursMock,
    senSnaAssignment: senSnaAssignmentMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SenTransitionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SenScopeService, useValue: mockScopeService },
      ],
    }).compile();

    service = module.get<SenTransitionService>(SenTransitionService);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });

    jest.clearAllMocks();
    mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
  });

  afterEach(() => jest.clearAllMocks());

  describe('createNote', () => {
    it('creates a transition note successfully', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senTransitionNoteMock.create.mockResolvedValue({
        id: 'note-1',
        sen_profile_id: PROFILE_ID,
        note_type: 'year_to_year',
        content: 'Share successful literacy supports.',
        created_at: new Date('2026-03-01T09:00:00.000Z'),
        created_by: {
          id: USER_ID,
          first_name: 'Maeve',
          last_name: 'Byrne',
        },
      });

      const result = await service.createNote(
        TENANT_ID,
        PROFILE_ID,
        {
          note_type: 'year_to_year',
          content: 'Share successful literacy supports.',
        },
        USER_ID,
      );

      expect(result).toEqual(
        expect.objectContaining({
          sen_profile_id: PROFILE_ID,
          note_type: 'year_to_year',
        }),
      );
      expect(senTransitionNoteMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            sen_profile_id: PROFILE_ID,
            created_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('throws when the profile does not exist', async () => {
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.createNote(
          TENANT_ID,
          PROFILE_ID,
          {
            note_type: 'general',
            content: 'No profile',
          },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findNotes', () => {
    it('returns notes ordered by created_at descending', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senTransitionNoteMock.findMany.mockResolvedValue([
        {
          id: 'note-2',
          sen_profile_id: PROFILE_ID,
          note_type: 'general',
          content: 'Most recent note',
          created_at: new Date('2026-03-02T10:00:00.000Z'),
          created_by: {
            id: USER_ID,
            first_name: 'Maeve',
            last_name: 'Byrne',
          },
        },
        {
          id: 'note-1',
          sen_profile_id: PROFILE_ID,
          note_type: 'year_to_year',
          content: 'Older note',
          created_at: new Date('2026-03-01T10:00:00.000Z'),
          created_by: {
            id: USER_ID,
            first_name: 'Maeve',
            last_name: 'Byrne',
          },
        },
      ]);

      const result = await service.findNotes(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID, {});

      expect(result).toHaveLength(2);
      expect(senTransitionNoteMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });
  });

  describe('generateHandoverPack', () => {
    const baseProfile = {
      id: PROFILE_ID,
      primary_category: 'learning',
      support_level: 'school_support',
      is_active: true,
      flagged_date: new Date('2026-01-10'),
      diagnosis: 'Dyslexia',
      student: {
        id: STUDENT_ID,
        first_name: 'Ava',
        last_name: 'Doyle',
        date_of_birth: new Date('2015-05-20'),
        year_group: { id: 'yg-1', name: 'First Year' },
      },
    };

    it('assembles a full handover pack with the latest resource year and active SNA', async () => {
      senProfileMock.findFirst.mockResolvedValue(baseProfile);
      senSupportPlanMock.findFirst.mockResolvedValue({
        id: 'plan-1',
        plan_number: 'SSP-001',
        status: 'active',
        goals: [
          {
            id: 'goal-1',
            title: 'Reading fluency',
            target: 'Read age-appropriate text independently',
            baseline: 'Needs support to decode unfamiliar words',
            current_level: 'Improving',
            status: 'in_progress',
            strategies: [
              {
                id: 'strategy-1',
                description: 'Daily guided reading',
                frequency: 'daily',
                responsible: {
                  id: USER_ID,
                  first_name: 'Maeve',
                  last_name: 'Byrne',
                },
              },
            ],
            progress_notes: [
              {
                id: 'progress-1',
                note: 'Better confidence this week',
                current_level: 'Improving',
                created_at: new Date('2026-03-10T09:00:00.000Z'),
              },
            ],
          },
        ],
      });
      senAccommodationMock.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          accommodation_type: 'exam',
          description: 'Reader support',
          is_active: true,
        },
      ]);
      senProfessionalInvolvementMock.findMany.mockResolvedValue([
        {
          id: 'prof-1',
          professional_type: 'speech_therapist',
          professional_name: 'Dr. Kearney',
          organisation: 'HSE',
          status: 'report_received',
          recommendations: 'Continue oral language supports',
          referral_date: new Date('2026-01-01'),
          assessment_date: new Date('2026-01-20'),
          report_received_date: new Date('2026-02-01'),
        },
      ]);
      senTransitionNoteMock.findMany.mockResolvedValue([
        {
          id: 'note-1',
          sen_profile_id: PROFILE_ID,
          note_type: 'year_to_year',
          content: 'Successful use of visual timetable.',
          created_at: new Date('2026-03-15T09:00:00.000Z'),
          created_by: {
            id: USER_ID,
            first_name: 'Maeve',
            last_name: 'Byrne',
          },
        },
      ]);
      senStudentHoursMock.findMany.mockResolvedValue([
        {
          allocated_hours: new Prisma.Decimal(3.5),
          used_hours: new Prisma.Decimal(2.25),
          resource_allocation: {
            academic_year: {
              id: 'year-older',
              name: '2024/2025',
              start_date: new Date('2024-09-01'),
            },
          },
        },
        {
          allocated_hours: new Prisma.Decimal(5),
          used_hours: new Prisma.Decimal(4.5),
          resource_allocation: {
            academic_year: {
              id: 'year-current',
              name: '2025/2026',
              start_date: new Date('2025-09-01'),
            },
          },
        },
        {
          allocated_hours: new Prisma.Decimal(1),
          used_hours: new Prisma.Decimal(0.5),
          resource_allocation: {
            academic_year: {
              id: 'year-current',
              name: '2025/2026',
              start_date: new Date('2025-09-01'),
            },
          },
        },
      ]);
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        start_date: new Date('2026-02-01'),
        schedule: { monday: [{ start: '09:00', end: '11:00' }] },
        staff_profile: {
          user: {
            first_name: 'Niamh',
            last_name: 'Walsh',
          },
        },
      });

      const result = await service.generateHandoverPack(
        TENANT_ID,
        USER_ID,
        ['sen.manage'],
        STUDENT_ID,
      );

      expect(result.student.name).toBe('Ava Doyle');
      expect(result.sen_profile.diagnosis).toBe('Dyslexia');
      expect(result.active_plan?.goals[0]?.strategies[0]?.responsible).toBe('Maeve Byrne');
      expect(result.accommodations).toHaveLength(1);
      expect(result.professionals).toHaveLength(1);
      expect(result.transition_notes).toHaveLength(1);
      expect(result.resource_hours).toEqual({
        academic_year_id: 'year-current',
        academic_year_name: '2025/2026',
        allocated_hours: 6,
        used_hours: 5,
      });
      expect(result.sna_assignment).toEqual({
        sna_name: 'Niamh Walsh',
        schedule: { monday: [{ start: '09:00', end: '11:00' }] },
        start_date: new Date('2026-02-01'),
      });
    });

    it('returns null sections when optional data is missing', async () => {
      senProfileMock.findFirst.mockResolvedValue(baseProfile);
      senSupportPlanMock.findFirst.mockResolvedValue(null);
      senAccommodationMock.findMany.mockResolvedValue([]);
      senProfessionalInvolvementMock.findMany.mockResolvedValue([]);
      senTransitionNoteMock.findMany.mockResolvedValue([]);
      senStudentHoursMock.findMany.mockResolvedValue([]);
      senSnaAssignmentMock.findFirst.mockResolvedValue(null);

      const result = await service.generateHandoverPack(
        TENANT_ID,
        USER_ID,
        ['sen.manage'],
        STUDENT_ID,
      );

      expect(result.active_plan).toBeNull();
      expect(result.accommodations).toEqual([]);
      expect(result.professionals).toEqual([]);
      expect(result.transition_notes).toEqual([]);
      expect(result.resource_hours).toBeNull();
      expect(result.sna_assignment).toBeNull();
    });

    it('throws when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(
        service.generateHandoverPack(TENANT_ID, USER_ID, [], STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when student is not in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['other-student-id'],
      });

      await expect(
        service.generateHandoverPack(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when SEN profile not found for student', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.generateHandoverPack(TENANT_ID, USER_ID, ['sen.manage'], STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('handles a goal strategy with no responsible user', async () => {
      senProfileMock.findFirst.mockResolvedValue(baseProfile);
      senSupportPlanMock.findFirst.mockResolvedValue({
        id: 'plan-1',
        plan_number: 'SSP-001',
        status: 'active',
        goals: [
          {
            id: 'goal-1',
            title: 'Reading',
            target: 'Target',
            baseline: 'Baseline',
            current_level: null,
            status: 'in_progress',
            strategies: [
              {
                id: 'strategy-1',
                description: 'Self-directed reading',
                frequency: 'weekly',
                responsible: null,
              },
            ],
            progress_notes: [],
          },
        ],
      });
      senAccommodationMock.findMany.mockResolvedValue([]);
      senProfessionalInvolvementMock.findMany.mockResolvedValue([]);
      senTransitionNoteMock.findMany.mockResolvedValue([]);
      senStudentHoursMock.findMany.mockResolvedValue([]);
      senSnaAssignmentMock.findFirst.mockResolvedValue(null);

      const result = await service.generateHandoverPack(
        TENANT_ID,
        USER_ID,
        ['sen.manage'],
        STUDENT_ID,
      );

      expect(result.active_plan?.goals[0]?.strategies[0]?.responsible).toBeNull();
    });
  });

  describe('findNotes — scope branches', () => {
    it('returns empty when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findNotes(TENANT_ID, USER_ID, [], PROFILE_ID, {});

      expect(result).toEqual([]);
    });

    it('returns empty when profile is not accessible in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['other-student'],
      });
      senProfileMock.findFirst.mockResolvedValue(null);

      const result = await service.findNotes(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID, {});

      expect(result).toEqual([]);
    });

    it('applies note_type filter when provided', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senTransitionNoteMock.findMany.mockResolvedValue([]);

      await service.findNotes(TENANT_ID, USER_ID, ['sen.manage'], PROFILE_ID, {
        note_type: 'year_to_year',
      });

      expect(senTransitionNoteMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            note_type: 'year_to_year',
          }),
        }),
      );
    });

    it('returns notes for class-scoped user with accessible profile', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: [STUDENT_ID],
      });
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senTransitionNoteMock.findMany.mockResolvedValue([
        {
          id: 'note-1',
          sen_profile_id: PROFILE_ID,
          note_type: 'general',
          content: 'Note content',
          created_at: new Date('2026-03-01T09:00:00.000Z'),
          created_by: {
            id: USER_ID,
            first_name: 'Maeve',
            last_name: 'Byrne',
          },
        },
      ]);

      const result = await service.findNotes(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID, {});

      expect(result).toHaveLength(1);
    });
  });
});
