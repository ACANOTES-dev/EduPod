import { Test, TestingModule } from '@nestjs/testing';

import type { BulkPositiveDto, QuickLogDto } from '@school/shared/behaviour';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourService } from './behaviour.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1111-1111-1111-111111111111';
const CATEGORY_ID = 'cat-11111-1111-1111-111111111111';
const STUDENT_ID_1 = 'student-1111-1111-1111-11111111';
const STUDENT_ID_2 = 'student-2222-2222-2222-22222222';
const STUDENT_ID_3 = 'student-3333-3333-3333-33333333';
const TEMPLATE_ID = 'tmpl-1111-1111-1111-111111111111';
const ACADEMIC_YEAR_ID = 'ay-11111-1111-1111-111111111111';

// ─── Factories ──────────────────────────────────────────────────────────

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  id: CATEGORY_ID,
  tenant_id: TENANT_ID,
  name: 'Helping Others',
  polarity: 'positive',
  severity: 1,
  point_value: 2,
  is_active: true,
  display_order: 1,
  ...overrides,
});

const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  category_id: CATEGORY_ID,
  name: 'Helped a peer',
  description_text: 'Student helped a peer in class',
  is_active: true,
  display_order: 1,
  ...overrides,
});

const makeParticipant = (studentId: string, overrides: Record<string, unknown> = {}) => ({
  id: `part-${studentId}`,
  tenant_id: TENANT_ID,
  participant_type: 'student',
  student_id: studentId,
  created_at: new Date('2026-03-01'),
  incident: { reported_by_id: USER_ID },
  student: {
    id: studentId,
    first_name: 'Student',
    last_name: studentId.slice(-4),
    year_group: { name: 'Year 7' },
  },
  ...overrides,
});

const makeIncidentResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'incident-new',
  tenant_id: TENANT_ID,
  status: 'active',
  category_id: CATEGORY_ID,
  ...overrides,
});

describe('BehaviourQuickLogService', () => {
  let service: BehaviourQuickLogService;
  let mockPrisma: {
    behaviourCategory: { findMany: jest.Mock };
    behaviourDescriptionTemplate: { findMany: jest.Mock };
    behaviourIncidentParticipant: { findMany: jest.Mock };
  };
  let mockBehaviourService: {
    createIncident: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourDescriptionTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourIncidentParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockBehaviourService = {
      createIncident: jest.fn().mockResolvedValue(makeIncidentResult()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourQuickLogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourService, useValue: mockBehaviourService },
      ],
    }).compile();

    service = module.get<BehaviourQuickLogService>(BehaviourQuickLogService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getContext ─────────────────────────────────────────────────────────

  describe('getContext', () => {
    it('should return active categories ordered by display_order', async () => {
      const categories = [
        makeCategory({ id: 'cat-1', display_order: 1, name: 'Helping' }),
        makeCategory({ id: 'cat-2', display_order: 2, name: 'Disruption' }),
      ];
      mockPrisma.behaviourCategory.findMany.mockResolvedValue(categories);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(result.categories).toEqual(categories);
      expect(mockPrisma.behaviourCategory.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, is_active: true },
        orderBy: { display_order: 'asc' },
      });
    });

    it('should return active templates grouped by category_id', async () => {
      const catA = 'cat-aaa';
      const catB = 'cat-bbb';
      const templates = [
        makeTemplate({ id: 't1', category_id: catA }),
        makeTemplate({ id: 't2', category_id: catA }),
        makeTemplate({ id: 't3', category_id: catB }),
      ];
      mockPrisma.behaviourDescriptionTemplate.findMany.mockResolvedValue(templates);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(Object.keys(result.templates)).toHaveLength(2);
      expect(result.templates[catA]).toHaveLength(2);
      expect(result.templates[catB]).toHaveLength(1);
    });

    it("should return recent 20 distinct students from user's incidents", async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        makeParticipant(STUDENT_ID_1),
        makeParticipant(STUDENT_ID_2),
      ]);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(result.recent_students).toHaveLength(2);
      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          distinct: ['student_id'],
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should return student details (id, first_name, last_name, year_group)', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        makeParticipant(STUDENT_ID_1, {
          student: {
            id: STUDENT_ID_1,
            first_name: 'Alice',
            last_name: 'Smith',
            year_group: { name: 'Year 9' },
          },
        }),
      ]);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(result.recent_students[0]).toEqual({
        id: STUDENT_ID_1,
        first_name: 'Alice',
        last_name: 'Smith',
        year_group: 'Year 9',
      });
    });

    it('should filter out participants with null student references', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        makeParticipant(STUDENT_ID_1),
        makeParticipant(STUDENT_ID_2, { student: null }),
      ]);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(result.recent_students).toHaveLength(1);
      expect(result.recent_students[0]?.id).toBe(STUDENT_ID_1);
    });

    it('edge: should return empty recent_students when user has no incidents', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);

      const result = await service.getContext(TENANT_ID, USER_ID);

      expect(result.recent_students).toEqual([]);
      expect(result.favourites).toEqual([]);
      expect(result.current_class).toBeNull();
    });
  });

  // ─── quickLog ──────────────────────────────────────────────────────────

  describe('quickLog', () => {
    const baseDto: QuickLogDto = {
      category_id: CATEGORY_ID,
      student_ids: [STUDENT_ID_1],
      description: 'Quick positive note',
      template_id: TEMPLATE_ID,
      context_type: 'class',
      idempotency_key: 'idem-1111-1111-1111-111111111111',
      academic_year_id: ACADEMIC_YEAR_ID,
    };

    it('should delegate to behaviourService.createIncident with auto_submit=true', async () => {
      await service.quickLog(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourService.createIncident).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          auto_submit: true,
        }),
      );
    });

    it('should set occurred_at to current time', async () => {
      const before = new Date();
      await service.quickLog(TENANT_ID, USER_ID, baseDto);
      const after = new Date();

      const callArgs = mockBehaviourService.createIncident.mock.calls[0]?.[2] as Record<
        string,
        unknown
      >;
      const occurredAt = new Date(callArgs.occurred_at as string);
      expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should pass through category_id, student_ids, description', async () => {
      await service.quickLog(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourService.createIncident).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          category_id: CATEGORY_ID,
          student_ids: [STUDENT_ID_1],
          description: 'Quick positive note',
        }),
      );
    });

    it('should pass through optional fields (template_id, context_type)', async () => {
      await service.quickLog(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourService.createIncident).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          template_id: TEMPLATE_ID,
          context_type: 'class',
        }),
      );
    });
  });

  // ─── bulkPositive ──────────────────────────────────────────────────────

  describe('bulkPositive', () => {
    const baseBulkDto: BulkPositiveDto = {
      category_id: CATEGORY_ID,
      student_ids: [STUDENT_ID_1, STUDENT_ID_2, STUDENT_ID_3],
      description: 'Great teamwork',
      context_type: 'class',
      academic_year_id: ACADEMIC_YEAR_ID,
    };

    it('should create one incident per student_id', async () => {
      mockBehaviourService.createIncident.mockResolvedValue(makeIncidentResult());

      await service.bulkPositive(TENANT_ID, USER_ID, baseBulkDto);

      expect(mockBehaviourService.createIncident).toHaveBeenCalledTimes(3);

      // Each call should have a single student
      const firstCall = mockBehaviourService.createIncident.mock.calls[0]?.[2] as Record<
        string,
        unknown
      >;
      const secondCall = mockBehaviourService.createIncident.mock.calls[1]?.[2] as Record<
        string,
        unknown
      >;
      const thirdCall = mockBehaviourService.createIncident.mock.calls[2]?.[2] as Record<
        string,
        unknown
      >;

      expect(firstCall.student_ids).toEqual([STUDENT_ID_1]);
      expect(secondCall.student_ids).toEqual([STUDENT_ID_2]);
      expect(thirdCall.student_ids).toEqual([STUDENT_ID_3]);
    });

    it('should return count matching student_ids length', async () => {
      mockBehaviourService.createIncident.mockResolvedValue(makeIncidentResult());

      const result = await service.bulkPositive(TENANT_ID, USER_ID, baseBulkDto);

      expect(result.count).toBe(3);
      expect(result.data).toHaveLength(3);
    });
  });
});
