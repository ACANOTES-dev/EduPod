import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { DashboardService } from './dashboard.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
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
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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
    .mockResolvedValueOnce(5)  // recentApplications
    .mockResolvedValueOnce(8)  // pendingApplications
    .mockResolvedValueOnce(12); // acceptedApplications
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let mockPrisma: {
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── schoolAdmin ──────────────────────────────────────────────────────────

  describe('schoolAdmin', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.schoolAdmin(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return school admin dashboard with stats and greeting', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Alice' });
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
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Bob' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
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
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Carol' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
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
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Dave' });

      mockRlsTx.student.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockRlsTx.staffProfile.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
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
  });

  // ─── parent ───────────────────────────────────────────────────────────────

  describe('parent', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.parent(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return parent dashboard with linked students', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Eva', preferred_locale: 'en' });
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
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Frank', preferred_locale: null });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      expect(result.students).toEqual([]);
      expect(result.greeting).toMatch(/Frank/);
    });

    it('should use Arabic greeting when preferred_locale is ar', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'فاطمة', preferred_locale: 'ar' });
      mockRlsTx.parent.findFirst.mockResolvedValue(null);

      const result = await service.parent(TENANT_ID, USER_ID);

      // Arabic greeting should contain the first name
      expect(result.greeting).toMatch(/فاطمة/);
    });

    it('should map null year_group and homeroom_class to null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Grace', preferred_locale: 'en' });
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
  });

  // ─── teacher ──────────────────────────────────────────────────────────────

  describe('teacher', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.teacher(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return teacher dashboard with empty schedule if no staff profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Henry' });
      mockRlsTx.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.teacher(TENANT_ID, USER_ID);

      expect(result.greeting).toMatch(/Henry/);
      expect(result.todays_schedule).toEqual([]);
      expect(result.todays_sessions).toEqual([]);
      expect(result.pending_submissions).toBe(0);
    });

    it('should return teacher dashboard with schedule and sessions for staff profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Irene' });
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
      mockPrisma.user.findUnique.mockResolvedValue({ first_name: 'Jack' });
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
  });

  // ─── unused constant suppression ──────────────────────────────────────────

  it('should reference all declared constants (lint guard)', () => {
    expect(REQUIREMENT_ID).toBeDefined();
    expect(YEAR_ID).toBeDefined();
    expect(ROOM_ID).toBeDefined();
  });
});
