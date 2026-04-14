import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { PayrollAttendanceService } from './payroll-attendance.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('PayrollAttendanceService', () => {
  let service: PayrollAttendanceService;
  let mockPrisma: {
    teacherAbsence: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      teacherAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findActiveStaff: jest.fn().mockResolvedValue([
              { id: 'staff-sarah', user: { first_name: 'Sarah', last_name: 'Daly' } },
              { id: 'staff-james', user: { first_name: 'James', last_name: 'Lee' } },
            ]),
          },
        },
      ],
    }).compile();
    service = module.get(PayrollAttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects malformed period strings', async () => {
    await expect(service.getAbsencePeriodSummary(TENANT_ID, '2026-4')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getAbsencePeriodSummary(TENANT_ID, 'April 2026')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('counts only weekday school days in the period', async () => {
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    // April 2026: 1st = Wed, 30 days. Weekends: 4,5,11,12,18,19,25,26 = 8 days.
    // School days = 30 - 8 = 22
    expect(result.meta.school_days_in_period).toBe(22);
    expect(result.data).toHaveLength(2);
    for (const summary of result.data) {
      expect(summary.days_worked).toBe(22);
      expect(summary.days_missed).toBe(0);
    }
  });

  it('subtracts a single-day full-day absence from days_worked', async () => {
    mockPrisma.teacherAbsence.findMany.mockResolvedValue([
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-15T00:00:00Z'), // Wednesday
        date_to: null,
        full_day: true,
        absence_type: 'self_reported',
        is_paid: true,
        leave_type: { code: 'sick', is_paid_default: true },
      },
    ]);
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    const sarah = result.data.find((s) => s.staff_profile_id === 'staff-sarah');
    expect(sarah?.days_worked).toBe(21);
    expect(sarah?.days_missed).toBe(1);
    expect(sarah?.paid_days_missed).toBe(1);
    expect(sarah?.unpaid_days_missed).toBe(0);
    expect(sarah?.breakdown).toEqual([{ leave_type: 'sick', is_paid: true, days: 1 }]);
  });

  it('counts a multi-day Mon–Fri absence as 5 school days', async () => {
    mockPrisma.teacherAbsence.findMany.mockResolvedValue([
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-13T00:00:00Z'), // Monday
        date_to: new Date('2026-04-17T00:00:00Z'), // Friday
        full_day: true,
        absence_type: 'approved_leave',
        is_paid: true,
        leave_type: { code: 'annual', is_paid_default: true },
      },
    ]);
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    const sarah = result.data.find((s) => s.staff_profile_id === 'staff-sarah');
    expect(sarah?.days_missed).toBe(5);
    expect(sarah?.days_worked).toBe(17);
  });

  it('counts a partial-day absence as 0.5', async () => {
    mockPrisma.teacherAbsence.findMany.mockResolvedValue([
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: false,
        absence_type: 'self_reported',
        is_paid: true,
        leave_type: { code: 'medical_appointment', is_paid_default: true },
      },
    ]);
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    const sarah = result.data.find((s) => s.staff_profile_id === 'staff-sarah');
    expect(sarah?.days_missed).toBe(0.5);
    expect(sarah?.days_worked).toBe(21.5);
  });

  it('separates paid vs unpaid breakdown', async () => {
    mockPrisma.teacherAbsence.findMany.mockResolvedValue([
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: true,
        absence_type: 'self_reported',
        is_paid: true,
        leave_type: { code: 'sick', is_paid_default: true },
      },
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-22T00:00:00Z'),
        date_to: null,
        full_day: true,
        absence_type: 'approved_leave',
        is_paid: false,
        leave_type: { code: 'unpaid_personal', is_paid_default: false },
      },
    ]);
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    const sarah = result.data.find((s) => s.staff_profile_id === 'staff-sarah');
    expect(sarah?.paid_days_missed).toBe(1);
    expect(sarah?.unpaid_days_missed).toBe(1);
    expect(sarah?.breakdown).toHaveLength(2);
  });

  it('clips an absence that extends past the period boundary', async () => {
    mockPrisma.teacherAbsence.findMany.mockResolvedValue([
      {
        staff_profile_id: 'staff-sarah',
        absence_date: new Date('2026-04-29T00:00:00Z'), // Wed
        date_to: new Date('2026-05-05T00:00:00Z'), // following Tue
        full_day: true,
        absence_type: 'approved_leave',
        is_paid: true,
        leave_type: { code: 'annual', is_paid_default: true },
      },
    ]);
    const result = await service.getAbsencePeriodSummary(TENANT_ID, '2026-04');
    const sarah = result.data.find((s) => s.staff_profile_id === 'staff-sarah');
    // Within April: 29(Wed) + 30(Thu) = 2 school days
    expect(sarah?.days_missed).toBe(2);
  });
});
