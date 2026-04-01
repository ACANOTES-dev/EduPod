import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStudentsService } from './behaviour-students.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STUDENT_ID = 'student-1';

// ─── Factories ──────────────────────────────────────────────────────────

const makeStudent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  first_name: 'John',
  last_name: 'Doe',
  student_number: 'STU-001',
  tenant_id: TENANT_ID,
  status: 'active',
  year_group_id: 'yg-1',
  year_group: { id: 'yg-1', name: 'Year 7' },
  _count: { bh_incident_participants: 3 },
  ...overrides,
});

const _makeParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: 'part-1',
  tenant_id: TENANT_ID,
  incident_id: 'inc-1',
  student_id: STUDENT_ID,
  participant_type: 'student',
  role: 'subject',
  points_awarded: -3,
  ...overrides,
});

const makeTimelineEntry = (incidentId: string, overrides: Record<string, unknown> = {}) => ({
  id: `part-${incidentId}`,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  participant_type: 'student',
  incident: {
    id: incidentId,
    status: 'active',
    polarity: 'negative',
    severity: 5,
    description: 'Disruptive behaviour',
    occurred_at: new Date('2026-03-15T10:00:00Z'),
    category: {
      id: 'cat-1',
      name: 'Disruption',
      name_ar: null,
      color: '#FF0000',
      icon: 'alert',
      polarity: 'negative',
    },
    reported_by: { id: USER_ID, first_name: 'Jane', last_name: 'Teacher' },
  },
  ...overrides,
});

const makeTask = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  tenant_id: TENANT_ID,
  task_type: 'follow_up',
  entity_type: 'incident',
  entity_id: 'inc-1',
  assigned_to_id: USER_ID,
  status: 'pending',
  priority: 'medium',
  due_date: new Date('2026-03-20'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────

describe('BehaviourStudentsService', () => {
  let service: BehaviourStudentsService;
  let mockPrisma: {
    student: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
    behaviourIncidentParticipant: {
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
    };
    behaviourTask: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    behaviourIncident: {
      findMany: jest.Mock;
    };
    behaviourSanction: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    behaviourRecognitionAward: {
      findMany: jest.Mock;
    };
    behaviourParentAcknowledgement: {
      findMany: jest.Mock;
    };
    behaviourIntervention: {
      count: jest.Mock;
    };
    dailyAttendanceSummary: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  let mockScope: { getUserScope: jest.Mock };
  let mockPoints: { getStudentPoints: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
      },
      behaviourIncidentParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { points_awarded: null } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      behaviourTask: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourIncident: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourSanction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourRecognitionAward: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourParentAcknowledgement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourIntervention: {
        count: jest.fn().mockResolvedValue(0),
      },
      dailyAttendanceSummary: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    mockScope = {
      getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
    };

    mockPoints = {
      getStudentPoints: jest.fn().mockResolvedValue({ total: 0, fromCache: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourStudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourScopeService, useValue: mockScope },
        { provide: BehaviourPointsService, useValue: mockPoints },
      ],
    }).compile();

    service = module.get<BehaviourStudentsService>(BehaviourStudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listStudents ─────────────────────────────────────────────────────

  describe('listStudents', () => {
    it('should return paginated students with behaviour summary', async () => {
      const students = [makeStudent('s-1'), makeStudent('s-2')];
      mockPrisma.student.findMany.mockResolvedValue(students);
      mockPrisma.student.count.mockResolvedValue(2);
      mockPrisma.behaviourIncidentParticipant.groupBy.mockResolvedValue([
        { student_id: 's-1', _sum: { points_awarded: 10 } },
        { student_id: 's-2', _sum: { points_awarded: -5 } },
      ]);

      const result = await service.listStudents(TENANT_ID, USER_ID, ['behaviour.admin'], 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(result.data[0]).toHaveProperty('total_points', 10);
      expect(result.data[0]).toHaveProperty('incident_count');
    });

    it('should apply "all" scope (no filter)', async () => {
      mockScope.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.student.count.mockResolvedValue(0);

      await service.listStudents(TENANT_ID, USER_ID, ['behaviour.admin'], 1, 20);

      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'active',
          }),
        }),
      );
      // 'all' scope means no id or year_group_id filter
      const callWhere = mockPrisma.student.findMany.mock.calls[0][0].where;
      expect(callWhere.id).toBeUndefined();
      expect(callWhere.year_group_id).toBeUndefined();
    });

    it('should apply "class" scope', async () => {
      mockScope.getUserScope.mockResolvedValue({
        scope: 'class',
        classStudentIds: ['s-1', 's-2'],
      });
      mockPrisma.student.findMany.mockResolvedValue([makeStudent('s-1')]);
      mockPrisma.student.count.mockResolvedValue(1);

      await service.listStudents(TENANT_ID, USER_ID, ['behaviour.view'], 1, 20);

      const callWhere = mockPrisma.student.findMany.mock.calls[0][0].where;
      expect(callWhere.id).toEqual({ in: ['s-1', 's-2'] });
    });

    it('should apply "year_group" scope', async () => {
      mockScope.getUserScope.mockResolvedValue({
        scope: 'year_group',
        yearGroupIds: ['yg-1', 'yg-2'],
      });
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.student.count.mockResolvedValue(0);

      await service.listStudents(TENANT_ID, USER_ID, ['behaviour.view'], 1, 20);

      const callWhere = mockPrisma.student.findMany.mock.calls[0][0].where;
      expect(callWhere.year_group_id).toEqual({ in: ['yg-1', 'yg-2'] });
    });

    it('should apply "own" scope (students from user\'s incidents only)', async () => {
      mockScope.getUserScope.mockResolvedValue({ scope: 'own' });
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValueOnce([
        { student_id: 's-1' },
        { student_id: 's-2' },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([makeStudent('s-1')]);
      mockPrisma.student.count.mockResolvedValue(1);

      await service.listStudents(TENANT_ID, USER_ID, ['behaviour.log'], 1, 20);

      // 'own' scope queries participant student_ids first
      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            participant_type: 'student',
            student_id: { not: null },
            incident: { reported_by_id: USER_ID },
          }),
        }),
      );
      const callWhere = mockPrisma.student.findMany.mock.calls[0][0].where;
      expect(callWhere.id).toEqual({ in: ['s-1', 's-2'] });
    });

    it('should include total_points and incident_count per student', async () => {
      mockPrisma.student.findMany.mockResolvedValue([makeStudent('s-1')]);
      mockPrisma.student.count.mockResolvedValue(1);
      mockPrisma.behaviourIncidentParticipant.groupBy.mockResolvedValue([
        { student_id: 's-1', _sum: { points_awarded: 42 } },
      ]);

      const result = await service.listStudents(TENANT_ID, USER_ID, ['behaviour.admin'], 1, 20);

      expect(result.data[0]).toMatchObject({
        total_points: 42,
        incident_count: 3, // from _count.bh_incident_participants in factory
      });
    });

    it('edge: should return empty data when no students match scope', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.student.count.mockResolvedValue(0);

      const result = await service.listStudents(TENANT_ID, USER_ID, ['behaviour.admin'], 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── getStudentProfile ────────────────────────────────────────────────

  describe('getStudentProfile', () => {
    const setupProfileMocks = () => {
      mockPrisma.student.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockPoints.getStudentPoints.mockResolvedValue({ total: 15, fromCache: false });
      mockPrisma.behaviourIncidentParticipant.count
        .mockResolvedValueOnce(10) // total incident count
        .mockResolvedValueOnce(6) // positive count
        .mockResolvedValueOnce(4); // negative count
    };

    it('should return student with points, summary counts', async () => {
      setupProfileMocks();

      const result = await service.getStudentProfile(TENANT_ID, STUDENT_ID);

      expect(result.student.id).toBe(STUDENT_ID);
      expect(result.points).toEqual({ total: 15, fromCache: false });
      expect(result.summary).toEqual({
        total_points: 15,
        total_incidents: 10,
        positive_count: 6,
        negative_count: 4,
      });
    });

    it('should throw NotFoundException for non-existent student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(service.getStudentProfile(TENANT_ID, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should aggregate positive/negative/total counts correctly', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockPoints.getStudentPoints.mockResolvedValue({ total: 25, fromCache: true });
      mockPrisma.behaviourIncidentParticipant.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(12) // positive
        .mockResolvedValueOnce(8); // negative

      const result = await service.getStudentProfile(TENANT_ID, STUDENT_ID);

      expect(result.summary.total_incidents).toBe(20);
      expect(result.summary.positive_count).toBe(12);
      expect(result.summary.negative_count).toBe(8);
      expect(result.summary.total_points).toBe(25);
    });
  });

  // ─── getStudentTimeline ───────────────────────────────────────────────

  describe('getStudentTimeline', () => {
    it('should return paginated timeline ordered by occurred_at desc', async () => {
      const entries = [makeTimelineEntry('inc-1'), makeTimelineEntry('inc-2')];
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue(entries);
      mockPrisma.behaviourIncidentParticipant.count.mockResolvedValue(2);

      const result = await service.getStudentTimeline(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { incident: { occurred_at: 'desc' } },
        }),
      );
    });

    it('should exclude withdrawn incidents', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncidentParticipant.count.mockResolvedValue(0);

      await service.getStudentTimeline(TENANT_ID, STUDENT_ID, 1, 20);

      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident: expect.objectContaining({
              status: { not: 'withdrawn' },
            }),
          }),
        }),
      );
    });

    it('should include category and reported_by details', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncidentParticipant.count.mockResolvedValue(0);

      await service.getStudentTimeline(TENANT_ID, STUDENT_ID, 1, 20);

      expect(mockPrisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            incident: expect.objectContaining({
              include: expect.objectContaining({
                category: expect.any(Object),
                reported_by: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ─── getStudentPoints ─────────────────────────────────────────────────

  describe('getStudentPoints', () => {
    it('should aggregate points_awarded', async () => {
      mockPrisma.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 42 },
      });

      const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);

      expect(result).toEqual({ total_points: 42 });
    });

    it('should return 0 when no participants exist', async () => {
      mockPrisma.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: null },
      });

      const result = await service.getStudentPoints(TENANT_ID, STUDENT_ID);

      expect(result).toEqual({ total_points: 0 });
    });
  });

  // ─── getStudentTasks ──────────────────────────────────────────────────

  describe('getStudentTasks', () => {
    it('should return tasks for incidents involving the student', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident_id: 'inc-1' },
        { incident_id: 'inc-2' },
      ]);
      const tasks = [makeTask('task-1'), makeTask('task-2')];
      mockPrisma.behaviourTask.findMany.mockResolvedValue(tasks);
      mockPrisma.behaviourTask.count.mockResolvedValue(2);

      const result = await service.getStudentTasks(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_type: 'incident',
            entity_id: { in: ['inc-1', 'inc-2'] },
          }),
        }),
      );
    });

    it('should paginate results', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident_id: 'inc-1' },
      ]);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([makeTask('task-1')]);
      mockPrisma.behaviourTask.count.mockResolvedValue(15);

      const result = await service.getStudentTasks(TENANT_ID, STUDENT_ID, 2, 5);

      expect(result.meta).toEqual({ page: 2, pageSize: 5, total: 15 });
      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it('edge: should return empty when student has no participation', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.behaviourTask.count.mockResolvedValue(0);

      const result = await service.getStudentTasks(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── getStudentPreview ────────────────────────────────────────────────

  describe('getStudentPreview', () => {
    it('should return lightweight preview', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockPoints.getStudentPoints.mockResolvedValue({ total: 10, fromCache: false });
      mockPrisma.behaviourIncidentParticipant.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3) // positive
        .mockResolvedValueOnce(2); // negative

      const result = await service.getStudentPreview(TENANT_ID, STUDENT_ID);

      expect(result).toMatchObject({
        id: STUDENT_ID,
        first_name: 'John',
        last_name: 'Doe',
        year_group: 'Year 7',
        total_points: 10,
        total_incidents: 5,
      });
    });

    it('should NOT include sensitive fields', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(makeStudent(STUDENT_ID));
      mockPoints.getStudentPoints.mockResolvedValue({ total: 0, fromCache: false });
      mockPrisma.behaviourIncidentParticipant.count.mockResolvedValue(0);

      const result = await service.getStudentPreview(TENANT_ID, STUDENT_ID);

      // Preview should not include full student object, only summary fields
      expect(result).not.toHaveProperty('student');
      expect(result).not.toHaveProperty('tenant_id');
      expect(result).not.toHaveProperty('points');
    });
  });

  // ─── getStudentAnalytics ──────────────────────────────────────────────

  describe('getStudentAnalytics', () => {
    it('should return summary with trend and breakdowns', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

      // MV query returns empty -> fallback to direct queries
      mockPrisma.$queryRaw.mockResolvedValue([]);

      // Fallback counts for summary: positive, negative, neutral, points
      mockPrisma.behaviourIncidentParticipant.count
        .mockResolvedValueOnce(5) // positive
        .mockResolvedValueOnce(3) // negative
        .mockResolvedValueOnce(1); // neutral
      mockPrisma.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 12 },
      });

      // Active interventions + pending sanctions
      mockPrisma.behaviourIntervention.count.mockResolvedValue(1);
      mockPrisma.behaviourSanction.count.mockResolvedValue(2);

      // Trend data (findMany for weekly trend)
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);

      const result = await service.getStudentAnalytics(TENANT_ID, STUDENT_ID);

      expect(result.data).toHaveProperty('summary');
      expect(result.data).toHaveProperty('trend');
      expect(result.data).toHaveProperty('category_breakdown');
      expect(result.data).toHaveProperty('period_comparison');
      expect(result.data).toHaveProperty('sanction_history');
      expect(result.data).toHaveProperty('attendance_correlation');
      expect(result.data.summary).toMatchObject({
        positive_count: 5,
        negative_count: 3,
        neutral_count: 1,
        total_incidents: 9,
      });
    });
  });

  // ─── getParentView ────────────────────────────────────────────────────

  describe('getParentView', () => {
    it('should only return parent-visible incidents with parent_description', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'John',
        last_name: 'Doe',
        student_number: 'STU-001',
      });

      const parentIncident = {
        id: 'inc-1',
        incident_number: 'BH-202603-0001',
        polarity: 'negative',
        severity: 3,
        parent_description: 'Your child was involved in an incident',
        parent_description_ar: null,
        occurred_at: new Date('2026-03-15T10:00:00Z'),
        category: {
          id: 'cat-1',
          name: 'Disruption',
          name_ar: null,
          polarity: 'negative',
        },
      };
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([parentIncident]);

      const result = await service.getParentView(TENANT_ID, STUDENT_ID);

      expect(result.data.student.id).toBe(STUDENT_ID);
      expect(result.data.incidents).toHaveLength(1);
      const firstIncident = result.data.incidents[0] as {
        description: string;
        context_notes?: string;
      };
      expect(firstIncident.description).toBe('Your child was involved in an incident');
      // Should NOT include raw description or context_notes
      expect(firstIncident).not.toHaveProperty('context_notes');

      // Verify parent_visible filter was applied
      expect(mockPrisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: { parent_visible: true },
          }),
        }),
      );
    });
  });
});
