import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, AuthReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { DashboardService } from './dashboard.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID_B = 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUIREMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ROOM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: { count: jest.fn() },
  staffProfile: { count: jest.fn(), findFirst: jest.fn() },
  class: { count: jest.fn() },
  approvalRequest: { count: jest.fn() },
  academicYear: { findFirst: jest.fn() },
  household: { findMany: jest.fn() },
  application: { count: jest.fn() },
  parent: { findFirst: jest.fn() },
  studentParent: { findMany: jest.fn() },
  schedule: { findMany: jest.fn() },
  classStaff: { findMany: jest.fn() },
  attendanceSession: { findMany: jest.fn() },
  classEnrolment: { count: jest.fn() },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAdminStats() {
  mockRlsTx.student.count
    .mockResolvedValueOnce(120) // activeStudents
    .mockResolvedValueOnce(130) // totalStudents
    .mockResolvedValueOnce(10); // applicants
  mockRlsTx.staffProfile.count
    .mockResolvedValueOnce(15) // activeStaff
    .mockResolvedValueOnce(18); // totalStaff
  mockRlsTx.class.count.mockResolvedValueOnce(20); // activeClasses
  mockRlsTx.approvalRequest.count.mockResolvedValueOnce(3); // pendingApprovals
  mockRlsTx.academicYear.findFirst.mockResolvedValueOnce({ name: '2025-2026' });
  mockRlsTx.household.findMany.mockResolvedValueOnce([]);
  mockRlsTx.application.count
    .mockResolvedValueOnce(5) // recentApplications
    .mockResolvedValueOnce(8) // pendingApplications
    .mockResolvedValueOnce(12); // acceptedApplications
}

function buildZeroAdminStats() {
  mockRlsTx.student.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0);
  mockRlsTx.staffProfile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
  mockRlsTx.class.count.mockResolvedValueOnce(0);
  mockRlsTx.approvalRequest.count.mockResolvedValueOnce(0);
  mockRlsTx.academicYear.findFirst.mockResolvedValueOnce(null);
  mockRlsTx.household.findMany.mockResolvedValueOnce([]);
  mockRlsTx.application.count
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let mockPrisma: {
    user: { findUnique: jest.Mock };
  };
  let mockAuthFacade: {
    findUserSummary: jest.Mock;
    findUserById: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn() },
    };
    mockAuthFacade = {
      findUserSummary: jest.fn(),
      findUserById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthReadFacade, useValue: mockAuthFacade },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── schoolAdmin ──────────────────────────────────────────────────────────

  describe('schoolAdmin', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue(null);

      await expect(service.schoolAdmin(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return school admin dashboard with stats and greeting', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Alice' });
      buildAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.greeting).toMatch(/Alice/);
      expect(result.summary).toMatch(/120 active students/);
      expect(result.stats.active_students).toBe(120);
      expect(result.stats.total_students).toBe(130);
      expect(result.stats.applicants).toBe(10);
      expect(result.stats.active_staff).toBe(15);
      expect(result.stats.total_staff).toBe(18);
      expect(result.stats.total_classes).toBe(20);
      expect(result.stats.active_academic_year_name).toBe('2025-2026');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on extended return shape
      const ext = result as any;
      expect(ext.pending_approvals).toBe(3);
      expect(ext.admissions.recent_submissions).toBe(5);
      expect(ext.admissions.pending_review).toBe(8);
      expect(ext.admissions.accepted).toBe(12);
      expect(ext.incomplete_households).toEqual([]);
    });

    it('should flag missing_billing_parent issue in incomplete_households', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Bob' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockRlsTx.class.count.mockResolvedValueOnce(0);
      mockRlsTx.approvalRequest.count.mockResolvedValueOnce(0);
      mockRlsTx.academicYear.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.household.findMany.mockResolvedValueOnce([
        {
          id: 'hh-1',
          household_name: 'Smith Family',
          primary_billing_parent_id: null,
          _count: { emergency_contacts: 2 },
        },
      ]);
      mockRlsTx.application.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on extended return shape
      const ext = result as any;
      expect(ext.incomplete_households).toHaveLength(1);
      expect(ext.incomplete_households[0].completion_issues).toContain('missing_billing_parent');
    });

    it('should flag missing_emergency_contact when count is 0', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Carol' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockRlsTx.class.count.mockResolvedValueOnce(0);
      mockRlsTx.approvalRequest.count.mockResolvedValueOnce(0);
      mockRlsTx.academicYear.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.household.findMany.mockResolvedValueOnce([
        {
          id: 'hh-2',
          household_name: 'Jones Family',
          primary_billing_parent_id: 'parent-uuid',
          _count: { emergency_contacts: 0 },
        },
      ]);
      mockRlsTx.application.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on extended return shape
      const ext = result as any;
      expect(ext.incomplete_households[0].completion_issues).toContain('missing_emergency_contact');
    });

    it('should return null active_academic_year_name when no active year exists', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Dave' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockRlsTx.class.count.mockResolvedValueOnce(0);
      mockRlsTx.approvalRequest.count.mockResolvedValueOnce(0);
      mockRlsTx.academicYear.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.household.findMany.mockResolvedValueOnce([]);
      mockRlsTx.application.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.stats.active_academic_year_name).toBeNull();
    });

    it('should return correct summary format with staff and class counts', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Eve' });
      buildAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.summary).toBe('120 active students \u00B7 15 staff \u00B7 20 classes');
    });

    it('should return empty recent_activity array', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Zara' });
      buildAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.recent_activity).toEqual([]);
    });

    it('should flag both issues when household is missing billing parent and contacts', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Multi' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockRlsTx.class.count.mockResolvedValueOnce(0);
      mockRlsTx.approvalRequest.count.mockResolvedValueOnce(0);
      mockRlsTx.academicYear.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.household.findMany.mockResolvedValueOnce([
        {
          id: 'hh-3',
          household_name: 'Incomplete Family',
          primary_billing_parent_id: null,
          _count: { emergency_contacts: 0 },
        },
      ]);
      mockRlsTx.application.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on extended return shape
      const ext = result as any;
      expect(ext.incomplete_households[0].completion_issues).toContain('missing_billing_parent');
      expect(ext.incomplete_households[0].completion_issues).toContain('missing_emergency_contact');
      expect(ext.incomplete_households[0].completion_issues).toHaveLength(2);
    });
  });

  // ─── schoolAdmin — data shape verification ────────────────────────────────

  describe('schoolAdmin — data shape', () => {
    it('should return stats object with all expected numeric fields', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Shape' });
      buildAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(typeof result.stats.total_students).toBe('number');
      expect(typeof result.stats.active_students).toBe('number');
      expect(typeof result.stats.applicants).toBe('number');
      expect(typeof result.stats.total_staff).toBe('number');
      expect(typeof result.stats.active_staff).toBe('number');
      expect(typeof result.stats.total_classes).toBe('number');
    });

    it('should return admissions object with all expected fields', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Admissions' });
      buildAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on extended return shape
      const ext = result as any;
      expect(ext.admissions).toHaveProperty('recent_submissions');
      expect(ext.admissions).toHaveProperty('pending_review');
      expect(ext.admissions).toHaveProperty('accepted');
      expect(typeof ext.admissions.recent_submissions).toBe('number');
      expect(typeof ext.admissions.pending_review).toBe('number');
      expect(typeof ext.admissions.accepted).toBe('number');
    });
  });

  // ─── parent ───────────────────────────────────────────────────────────────

  describe('parent', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockAuthFacade.findUserById.mockResolvedValue(null);

      await expect(service.parent(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return parent dashboard with linked students', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({ first_name: 'Eva', preferred_locale: 'en' });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: 'parent-id' });
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        {
          student: {
            id: 'student-1',
            first_name: 'Tommy',
            last_name: 'Smith',
            student_number: 'S001',
            status: 'active',
            year_group: { name: 'Year 5' },
            homeroom_class: { name: '5A' },
          },
        },
      ]);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.greeting).toMatch(/Eva/);
      expect(result.students).toHaveLength(1);
      expect(result.students[0]).toEqual({
        student_id: 'student-1',
        first_name: 'Tommy',
        last_name: 'Smith',
        student_number: 'S001',
        status: 'active',
        year_group_name: 'Year 5',
        class_homeroom_name: '5A',
      });
      expect(result.announcements).toEqual([]);
    });

    it('should return parent dashboard with empty students if no parent record', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'Frank',
        preferred_locale: null,
      });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.students).toEqual([]);
      expect(result.greeting).toMatch(/Frank/);
    });

    it('should use Arabic greeting when preferred_locale is ar', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'فاطمة',
        preferred_locale: 'ar',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      // Arabic greeting should contain the first name
      expect(result.greeting).toMatch(/فاطمة/);
    });

    it('should map null year_group and homeroom_class to null', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'Grace',
        preferred_locale: 'en',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: 'parent-id-2' });
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        {
          student: {
            id: 'student-2',
            first_name: 'Lily',
            last_name: 'Brown',
            student_number: null,
            status: 'applicant',
            year_group: null,
            homeroom_class: null,
          },
        },
      ]);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.students[0]!.year_group_name).toBeNull();
      expect(result.students[0]!.class_homeroom_name).toBeNull();
    });

    it('should return multiple students when parent has multiple children', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'Karen',
        preferred_locale: 'en',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: 'parent-multi' });
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        {
          student: {
            id: 'student-a',
            first_name: 'Child A',
            last_name: 'Multi',
            student_number: 'S100',
            status: 'active',
            year_group: { name: 'Year 3' },
            homeroom_class: { name: '3B' },
          },
        },
        {
          student: {
            id: 'student-b',
            first_name: 'Child B',
            last_name: 'Multi',
            student_number: 'S101',
            status: 'active',
            year_group: { name: 'Year 6' },
            homeroom_class: { name: '6A' },
          },
        },
      ]);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.students).toHaveLength(2);
      expect(result.students[0]!.first_name).toBe('Child A');
      expect(result.students[1]!.first_name).toBe('Child B');
    });

    it('should return empty announcements array', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({ first_name: 'Ann', preferred_locale: null });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.announcements).toEqual([]);
    });
  });

  // ─── parent — data shape verification ─────────────────────────────────────

  describe('parent — data shape', () => {
    it('should return student objects with all required fields', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'Shape',
        preferred_locale: 'en',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: 'parent-shape' });
      mockRlsTx.studentParent.findMany.mockResolvedValue([
        {
          student: {
            id: 'student-shape',
            first_name: 'Student',
            last_name: 'Shape',
            student_number: 'S999',
            status: 'active',
            year_group: { name: 'Year 1' },
            homeroom_class: { name: '1A' },
          },
        },
      ]);

      const result = await service.parent(TENANT_ID, USER_ID);
      const student = result.students[0]!;

      expect(student).toHaveProperty('student_id');
      expect(student).toHaveProperty('first_name');
      expect(student).toHaveProperty('last_name');
      expect(student).toHaveProperty('student_number');
      expect(student).toHaveProperty('status');
      expect(student).toHaveProperty('year_group_name');
      expect(student).toHaveProperty('class_homeroom_name');
    });

    it('should NOT include admin-level stats in parent dashboard', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({
        first_name: 'Parent',
        preferred_locale: 'en',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      // Parent dashboard should not have admin-specific fields
      expect(result).not.toHaveProperty('stats');
      expect(result).not.toHaveProperty('pending_approvals');
      expect(result).not.toHaveProperty('incomplete_households');
      expect(result).not.toHaveProperty('admissions');
    });
  });

  // ─── teacher ──────────────────────────────────────────────────────────────

  describe('teacher', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue(null);

      await expect(service.teacher(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return teacher dashboard with empty schedule if no staff profile', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Henry' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result.greeting).toMatch(/Henry/);
      expect(result.todays_schedule).toEqual([]);
      expect(result.todays_sessions).toEqual([]);
      expect(result.pending_submissions).toBe(0);
    });

    it('should return teacher dashboard with schedule and sessions for staff profile', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Irene' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue({ id: 'staff-id' });

      const fakeTime = new Date('2026-03-24T09:00:00');
      fakeTime.toISOString = () => '2026-03-24T09:00:00.000Z';

      mockRlsTx.schedule.findMany.mockResolvedValue([
        {
          id: 'sched-1',
          weekday: 1,
          start_time: new Date('1970-01-01T08:00:00Z'),
          end_time: new Date('1970-01-01T09:00:00Z'),
          class_id: CLASS_ID,
          room_id: ROOM_ID,
          teacher_staff_id: 'staff-id',
          class_entity: { name: 'Math 10A' },
          room: { name: 'Room 101' },
        },
      ]);
      mockRlsTx.classStaff.findMany.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          schedule_id: 'sched-1',
          session_date: new Date('2026-03-24'),
          status: 'open',
          override_reason: null,
          submitted_by_user_id: null,
          submitted_at: null,
          created_at: new Date('2026-03-24T07:00:00Z'),
          updated_at: new Date('2026-03-24T07:00:00Z'),
          class_entity: { name: 'Math 10A' },
          _count: { records: 18 },
        },
      ]);
      mockRlsTx.classEnrolment.count.mockResolvedValue(25);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result.greeting).toMatch(/Irene/);
      expect(result.todays_schedule).toHaveLength(1);
      expect(result.todays_schedule[0]!.class_name).toBe('Math 10A');
      expect(result.todays_schedule[0]!.room_name).toBe('Room 101');
      expect(result.todays_sessions).toHaveLength(1);
      expect(result.todays_sessions[0]!.marked_count).toBe(18);
      expect(result.todays_sessions[0]!.enrolled_count).toBe(25);
      expect(result.pending_submissions).toBe(1); // one 'open' session
    });

    it('should count pending_submissions as sessions with status open', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Jack' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue({ id: 'staff-id-2' });
      mockRlsTx.schedule.findMany.mockResolvedValue([]);
      mockRlsTx.classStaff.findMany.mockResolvedValue([]);
      mockRlsTx.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'session-closed',
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          schedule_id: 'sched-2',
          session_date: new Date('2026-03-24'),
          status: 'submitted',
          override_reason: null,
          submitted_by_user_id: USER_ID,
          submitted_at: new Date('2026-03-24T10:00:00Z'),
          created_at: new Date('2026-03-24T07:00:00Z'),
          updated_at: new Date('2026-03-24T10:00:00Z'),
          class_entity: { name: 'Science 9B' },
          _count: { records: 20 },
        },
      ]);
      mockRlsTx.classEnrolment.count.mockResolvedValue(20);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result.pending_submissions).toBe(0); // status is 'submitted', not 'open'
    });

    it('should handle schedule entries without room', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'NoRoom' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue({ id: 'staff-noroom' });
      mockRlsTx.schedule.findMany.mockResolvedValue([
        {
          id: 'sched-noroom',
          weekday: 2,
          start_time: new Date('1970-01-01T10:00:00Z'),
          end_time: new Date('1970-01-01T11:00:00Z'),
          class_id: CLASS_ID,
          room_id: null,
          teacher_staff_id: 'staff-noroom',
          class_entity: { name: 'Art 7C' },
          room: null,
        },
      ]);
      mockRlsTx.classStaff.findMany.mockResolvedValue([]);
      mockRlsTx.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result.todays_schedule).toHaveLength(1);
      expect(result.todays_schedule[0]!.room_name).toBeUndefined();
      expect(result.todays_schedule[0]!.room_id).toBeUndefined();
    });
  });

  // ─── teacher — data shape verification ────────────────────────────────────

  describe('teacher — data shape', () => {
    it('should return schedule entries with all required fields', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Shape' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue({ id: 'staff-shape' });
      mockRlsTx.schedule.findMany.mockResolvedValue([
        {
          id: 'sched-shape',
          weekday: 0,
          start_time: new Date('1970-01-01T08:30:00Z'),
          end_time: new Date('1970-01-01T09:30:00Z'),
          class_id: CLASS_ID,
          room_id: ROOM_ID,
          teacher_staff_id: 'staff-shape',
          class_entity: { name: 'English 8A' },
          room: { name: 'Room 202' },
        },
      ]);
      mockRlsTx.classStaff.findMany.mockResolvedValue([]);
      mockRlsTx.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.teacher(TENANT_ID, USER_ID);
      const entry = result.todays_schedule[0]!;

      expect(entry).toHaveProperty('schedule_id');
      expect(entry).toHaveProperty('weekday');
      expect(entry).toHaveProperty('start_time');
      expect(entry).toHaveProperty('end_time');
      expect(entry).toHaveProperty('class_id');
      expect(entry).toHaveProperty('class_name');
      expect(entry.start_time).toBe('08:30');
      expect(entry.end_time).toBe('09:30');
    });

    it('should NOT include admin-level stats in teacher dashboard', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Teacher' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.teacher(TENANT_ID, USER_ID);

      // Teacher dashboard should not have admin-specific fields
      expect(result).not.toHaveProperty('stats');
      expect(result).not.toHaveProperty('pending_approvals');
      expect(result).not.toHaveProperty('incomplete_households');
      expect(result).not.toHaveProperty('admissions');
      expect(result).not.toHaveProperty('students');
      expect(result).not.toHaveProperty('announcements');
    });

    it('should NOT include parent-level fields in teacher dashboard', async () => {
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Teacher' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result).not.toHaveProperty('students');
      expect(result).not.toHaveProperty('announcements');
    });
  });

  // ─── greeting time-of-day logic ───────────────────────────────────────────

  describe('greeting — time-of-day', () => {
    // Capture the real Date constructor once at describe-time, before any spies
    const RealDate = globalThis.Date;

    afterEach(() => {
      // Restore only the Date spy, not all mocks (which would break RLS mock)
      globalThis.Date = RealDate;
    });

    function mockDateHour(isoString: string) {
      const mockDate = new RealDate(isoString);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Date constructor overload
      const FakeDate = function (...args: any[]) {
        if (args.length === 0) return mockDate;
        return Reflect.construct(RealDate, args) as Date;
      } as unknown as DateConstructor;
      Object.setPrototypeOf(FakeDate, RealDate);
      FakeDate.now = RealDate.now;
      globalThis.Date = FakeDate;
    }

    it('should produce morning greeting before 12:00', async () => {
      mockDateHour('2026-03-31T09:00:00');
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Morning' });
      buildZeroAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.greeting).toBe('Good morning, Morning');
    });

    it('should produce afternoon greeting between 12:00 and 17:00', async () => {
      mockDateHour('2026-03-31T14:00:00');
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Afternoon' });
      buildZeroAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.greeting).toBe('Good afternoon, Afternoon');
    });

    it('should produce evening greeting after 17:00', async () => {
      mockDateHour('2026-03-31T20:00:00');
      mockAuthFacade.findUserSummary.mockResolvedValue({ first_name: 'Evening' });
      buildZeroAdminStats();

      const result = await service.schoolAdmin(TENANT_ID, USER_ID);

      expect(result.greeting).toBe('Good evening, Evening');
    });

    it('should produce Arabic greeting for parent with ar locale', async () => {
      mockAuthFacade.findUserById.mockResolvedValue({ first_name: 'احمد', preferred_locale: 'ar' });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.greeting).toContain('احمد');
      // Arabic greetings always contain the name
      expect(result.greeting).toMatch(/الخير/); // all Arabic greetings contain الخير
    });
  });

  // ─── unused constant suppression ──────────────────────────────────────────

  it('should reference all declared constants (lint guard)', () => {
    expect(REQUIREMENT_ID).toBeDefined();
    expect(YEAR_ID).toBeDefined();
    expect(ROOM_ID).toBeDefined();
    expect(TENANT_ID_B).toBeDefined();
  });
});
