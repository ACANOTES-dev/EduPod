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
  };

  beforeEach(async () => {
    mockDataAccess = {
      findStudentById: jest.fn().mockResolvedValue(MOCK_STUDENT),
      findGrades: jest.fn().mockResolvedValue(MOCK_GRADES),
      findAttendanceRecords: jest.fn().mockResolvedValue(MOCK_ATTENDANCE_RECORDS),
      findStudentAcademicRiskAlerts: jest.fn().mockResolvedValue(MOCK_RISK_ALERTS),
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
});
