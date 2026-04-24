import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ReportsDataAccessService } from './reports-data-access.service';
import { StudentProgressService } from './student-progress.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const MOCK_STUDENT = {
  id: STUDENT_ID,
  first_name: 'John',
  last_name: 'Doe',
  year_group: { name: 'Year 9' },
  homeroom_class: { name: '9A' },
};

const MOCK_GRADES = [
  {
    raw_score: '80',
    assessment: {
      max_score: '100',
      subject: { id: 'sub-1', name: 'Mathematics' },
      academic_period: { name: 'Term 1' },
    },
  },
  {
    raw_score: '70',
    assessment: {
      max_score: '100',
      subject: { id: 'sub-1', name: 'Mathematics' },
      academic_period: { name: 'Term 2' },
    },
  },
];

const MOCK_ATTENDANCE_RECORDS = [
  { status: 'present', session: { session_date: new Date('2026-01-15') } },
  { status: 'absent', session: { session_date: new Date('2026-01-20') } },
  { status: 'late', session: { session_date: new Date('2026-02-10') } },
];

const MOCK_RISK_ALERTS = [
  {
    id: 'alert-1',
    alert_type: 'low_attendance',
    risk_level: 'high',
    created_at: new Date('2026-03-01'),
    resolved_at: null,
  },
];

describe('StudentProgressService', () => {
  let service: StudentProgressService;
  let mockDataAccess: {
    findStudentById: jest.Mock;
    findGrades: jest.Mock;
    findAttendanceRecords: jest.Mock;
    findStudentAcademicRiskAlerts: jest.Mock;
    findStudents: jest.Mock;
    findAcademicPeriods: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      findStudentById: jest.fn().mockResolvedValue(MOCK_STUDENT),
      findGrades: jest.fn().mockResolvedValue(MOCK_GRADES),
      findAttendanceRecords: jest.fn().mockResolvedValue(MOCK_ATTENDANCE_RECORDS),
      findStudentAcademicRiskAlerts: jest.fn().mockResolvedValue(MOCK_RISK_ALERTS),
      findStudents: jest.fn().mockResolvedValue([]),
      findAcademicPeriods: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentProgressService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<StudentProgressService>(StudentProgressService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student progress report with correct student name', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.student_id).toBe(STUDENT_ID);
    expect(result.student_name).toBe('John Doe');
  });

  it('should include year group and class name from student record', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.year_group_name).toBe('Year 9');
    expect(result.class_name).toBe('9A');
  });

  it('should build grade trends grouped by subject', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.grade_trends).toHaveLength(1);
    expect(result.grade_trends[0]!.subject_name).toBe('Mathematics');
    expect(result.grade_trends[0]!.grades).toHaveLength(2);
  });

  it('should build attendance trend grouped by month', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.attendance_trend.length).toBeGreaterThanOrEqual(1);
    const jan = result.attendance_trend.find((e) => e.period_label === '2026-01');
    expect(jan).toBeDefined();
    expect(jan?.total_sessions).toBe(2);
    expect(jan?.attendance_rate).toBe(50);
  });

  it('should return risk alerts mapped to correct shape', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.risk_alerts).toHaveLength(1);
    expect(result.risk_alerts[0]!.alert_id).toBe('alert-1');
    expect(result.risk_alerts[0]!.alert_type).toBe('low_attendance');
    expect(result.risk_alerts[0]!.severity).toBe('high');
    expect(result.risk_alerts[0]!.acknowledged_at).toBeNull();
  });

  it('should compute overall_progress_score within 0-100 range', async () => {
    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.overall_progress_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_progress_score).toBeLessThanOrEqual(100);
  });

  it('should set null for year_group_name when student has no year group', async () => {
    mockDataAccess.findStudentById.mockResolvedValue({
      ...MOCK_STUDENT,
      year_group: null,
      homeroom_class: null,
    });

    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.year_group_name).toBeNull();
    expect(result.class_name).toBeNull();
  });

  it('should throw NotFoundException when student does not exist', async () => {
    mockDataAccess.findStudentById.mockResolvedValue(null);

    await expect(service.getStudentProgress(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should handle empty grades and use attendance-only progress score', async () => {
    mockDataAccess.findGrades.mockResolvedValue([]);

    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.grade_trends).toHaveLength(0);
    expect(result.overall_progress_score).toBeGreaterThanOrEqual(0);
  });

  it('should skip grade entries where subject or period is missing', async () => {
    mockDataAccess.findGrades.mockResolvedValue([
      {
        raw_score: '90',
        assessment: { max_score: '100', subject: null, academic_period: null },
      },
    ]);

    const result = await service.getStudentProgress(TENANT_ID, STUDENT_ID);

    expect(result.grade_trends).toHaveLength(0);
  });

  // ─── getTrendsByCohort ────────────────────────────────────────────────────

  describe('getTrendsByCohort', () => {
    const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const MOCK_PERIOD = {
      id: PERIOD_ID,
      name: 'Term 1',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-04-30'),
    };

    it('throws NotFoundException when academic period is missing', async () => {
      mockDataAccess.findStudents.mockResolvedValue([]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([]);

      await expect(service.getTrendsByCohort(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns zero aggregates when the cohort has no students', async () => {
      mockDataAccess.findStudents.mockResolvedValue([]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([MOCK_PERIOD]);

      const result = await service.getTrendsByCohort(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID);

      expect(result).toEqual({
        year_group_id: YEAR_GROUP_ID,
        academic_period_id: PERIOD_ID,
        period_label: 'Term 1',
        attendance_rate: 0,
        average_grade: 0,
        students_count: 0,
        total_sessions: 0,
        total_grades: 0,
      });
    });

    it('averages attendance and grades across the cohort', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([MOCK_PERIOD]);
      mockDataAccess.findAttendanceRecords.mockResolvedValue([
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' },
        { status: 'late' },
      ]);
      mockDataAccess.findGrades.mockResolvedValue([
        { raw_score: '80', assessment: { max_score: '100' } },
        { raw_score: '60', assessment: { max_score: '100' } },
      ]);

      const result = await service.getTrendsByCohort(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID);

      expect(result.students_count).toBe(2);
      expect(result.total_sessions).toBe(4);
      expect(result.total_grades).toBe(2);
      expect(result.attendance_rate).toBe(75); // 3 present+late out of 4
      expect(result.average_grade).toBe(70);
    });

    it('scopes attendance lookup to the period date range', async () => {
      mockDataAccess.findStudents.mockResolvedValue([{ id: 's1' }]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([MOCK_PERIOD]);

      await service.getTrendsByCohort(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID);

      const attendanceCall = mockDataAccess.findAttendanceRecords.mock.calls[0]?.[1];
      expect(attendanceCall?.where.session.session_date).toEqual({
        gte: MOCK_PERIOD.start_date,
        lte: MOCK_PERIOD.end_date,
      });
    });
  });

  // ─── listAtRiskStudentsNewThisWeek ────────────────────────────────────────

  describe('listAtRiskStudentsNewThisWeek', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-24T10:00:00.000Z')); // Friday
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('returns empty list when no risk alerts this week', async () => {
      mockDataAccess.findStudentAcademicRiskAlerts.mockResolvedValue([]);

      const result = await service.listAtRiskStudentsNewThisWeek(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('deduplicates by student_id keeping the newest alert', async () => {
      mockDataAccess.findStudentAcademicRiskAlerts.mockResolvedValue([
        {
          id: 'alert-1',
          student_id: 's1',
          alert_type: 'low_attendance',
          risk_level: 'high',
          created_at: new Date('2026-04-22T08:00:00.000Z'),
          student: {
            id: 's1',
            first_name: 'Alice',
            last_name: 'Smith',
            year_group: { name: 'Year 5' },
          },
        },
        {
          id: 'alert-2',
          student_id: 's1',
          alert_type: 'behaviour',
          risk_level: 'medium',
          created_at: new Date('2026-04-21T08:00:00.000Z'),
          student: {
            id: 's1',
            first_name: 'Alice',
            last_name: 'Smith',
            year_group: { name: 'Year 5' },
          },
        },
      ]);

      const result = await service.listAtRiskStudentsNewThisWeek(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.alert_id).toBe('alert-1');
    });

    it('filters alerts to the current ISO week range', async () => {
      mockDataAccess.findStudentAcademicRiskAlerts.mockResolvedValue([]);

      await service.listAtRiskStudentsNewThisWeek(TENANT_ID);

      const call = mockDataAccess.findStudentAcademicRiskAlerts.mock.calls[0]?.[1];
      const whereCreatedAt = call?.where?.created_at;
      expect(whereCreatedAt).toBeDefined();
      expect(whereCreatedAt?.gte).toBeInstanceOf(Date);
      expect(whereCreatedAt?.lt).toBeInstanceOf(Date);
      // Start of current week is Sunday at 00:00 local; using UTC for comparison
      const gteDay = (whereCreatedAt?.gte as Date).getDay();
      expect(gteDay).toBe(0); // Sunday
    });
  });

  // ─── RLS isolation ────────────────────────────────────────────────────────

  describe('RLS isolation', () => {
    it('passes tenantId through to findStudents for cohort trends', async () => {
      mockDataAccess.findStudents.mockResolvedValue([]);
      mockDataAccess.findAcademicPeriods.mockResolvedValue([
        {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date(),
          end_date: new Date(),
        },
      ]);

      await service.getTrendsByCohort(TENANT_ID, 'yg-1', 'p1');

      expect(mockDataAccess.findStudents).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ where: { year_group_id: 'yg-1' } }),
      );
    });

    it('does not leak a different tenant via findStudentAcademicRiskAlerts', async () => {
      const OTHER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      mockDataAccess.findStudentAcademicRiskAlerts.mockImplementation((tenantId: string) =>
        tenantId === TENANT_ID ? MOCK_RISK_ALERTS : [],
      );

      const result = await service.listAtRiskStudentsNewThisWeek(OTHER);

      expect(result).toEqual([]);
    });
  });
});
