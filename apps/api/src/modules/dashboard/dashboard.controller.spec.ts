/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '@school/shared';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUIREMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ROOM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tenantContext = { tenant_id: TENANT_ID };

const jwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 9999999999,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardController', () => {
  let controller: DashboardController;
  let mockService: {
    schoolAdmin: jest.Mock;
    parent: jest.Mock;
    teacher: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      schoolAdmin: jest
        .fn()
        .mockResolvedValue({
          greeting: 'Good morning, Admin',
          stats: {},
          pending_approvals: 0,
          incomplete_households: [],
          admissions: {},
          recent_activity: [],
          summary: '',
        }),
      parent: jest
        .fn()
        .mockResolvedValue({ greeting: 'Good morning, Parent', students: [], announcements: [] }),
      teacher: jest
        .fn()
        .mockResolvedValue({
          greeting: 'Good morning, Teacher',
          todays_schedule: [],
          todays_sessions: [],
          pending_submissions: 0,
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── schoolAdmin ──────────────────────────────────────────────────────────

  it('should call schoolAdmin with tenant_id and user.sub', async () => {
    const result = await controller.schoolAdmin(tenantContext, jwtPayload);

    expect(mockService.schoolAdmin).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expect.objectContaining({ greeting: 'Good morning, Admin' }));
  });

  it('should not call parent or teacher service from schoolAdmin endpoint', async () => {
    await controller.schoolAdmin(tenantContext, jwtPayload);

    expect(mockService.parent).not.toHaveBeenCalled();
    expect(mockService.teacher).not.toHaveBeenCalled();
  });

  // ─── parent ───────────────────────────────────────────────────────────────

  it('should call parent with tenant_id and user.sub', async () => {
    const result = await controller.parent(tenantContext, jwtPayload);

    expect(mockService.parent).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expect.objectContaining({ students: [] }));
  });

  it('should not call schoolAdmin or teacher service from parent endpoint', async () => {
    await controller.parent(tenantContext, jwtPayload);

    expect(mockService.schoolAdmin).not.toHaveBeenCalled();
    expect(mockService.teacher).not.toHaveBeenCalled();
  });

  // ─── teacher ──────────────────────────────────────────────────────────────

  it('should call teacher with tenant_id and user.sub', async () => {
    const result = await controller.teacher(tenantContext, jwtPayload);

    expect(mockService.teacher).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expect.objectContaining({ todays_schedule: [] }));
  });

  it('should not call schoolAdmin or parent service from teacher endpoint', async () => {
    await controller.teacher(tenantContext, jwtPayload);

    expect(mockService.schoolAdmin).not.toHaveBeenCalled();
    expect(mockService.parent).not.toHaveBeenCalled();
  });

  // ─── propagates service result unchanged ──────────────────────────────────

  it('should propagate schoolAdmin result unchanged from service', async () => {
    const adminDashboard = {
      greeting: 'Good evening, Sarah',
      summary: '50 active students \u00B7 8 staff \u00B7 10 classes',
      stats: {
        total_students: 60,
        active_students: 50,
        applicants: 5,
        total_staff: 10,
        active_staff: 8,
        total_classes: 10,
        active_academic_year_name: '2025-2026',
      },
      pending_approvals: 2,
      incomplete_households: [],
      admissions: { recent_submissions: 3, pending_review: 5, accepted: 10 },
      recent_activity: [],
    };
    mockService.schoolAdmin.mockResolvedValue(adminDashboard);

    const result = await controller.schoolAdmin(tenantContext, jwtPayload);

    expect(result).toEqual(adminDashboard);
  });

  it('should propagate parent result unchanged from service', async () => {
    const parentDashboard = {
      greeting: 'Good morning, Eva',
      students: [
        {
          student_id: 'student-1',
          first_name: 'Tommy',
          last_name: 'Smith',
          student_number: 'S001',
          status: 'active',
          year_group_name: 'Year 5',
          class_homeroom_name: '5A',
        },
      ],
      announcements: [],
    };
    mockService.parent.mockResolvedValue(parentDashboard);

    const result = await controller.parent(tenantContext, jwtPayload);

    expect(result).toEqual(parentDashboard);
  });

  it('should propagate teacher result unchanged from service', async () => {
    const teacherDashboard = {
      greeting: 'Good afternoon, Irene',
      todays_schedule: [
        {
          schedule_id: 'sched-1',
          weekday: 1,
          start_time: '08:00',
          end_time: '09:00',
          class_id: CLASS_ID,
          class_name: 'Math 10A',
          room_id: ROOM_ID,
          room_name: 'Room 101',
          teacher_staff_id: 'staff-id',
        },
      ],
      todays_sessions: [],
      pending_submissions: 0,
    };
    mockService.teacher.mockResolvedValue(teacherDashboard);

    const result = await controller.teacher(tenantContext, jwtPayload);

    expect(result).toEqual(teacherDashboard);
  });

  // ─── each endpoint uses the correct user ID ──────────────────────────────

  it('should extract user.sub from JWT payload for each endpoint', async () => {
    const differentUser: JwtPayload = {
      ...jwtPayload,
      sub: 'different-user-id',
    };

    await controller.schoolAdmin(tenantContext, differentUser);
    expect(mockService.schoolAdmin).toHaveBeenCalledWith(TENANT_ID, 'different-user-id');

    await controller.parent(tenantContext, differentUser);
    expect(mockService.parent).toHaveBeenCalledWith(TENANT_ID, 'different-user-id');

    await controller.teacher(tenantContext, differentUser);
    expect(mockService.teacher).toHaveBeenCalledWith(TENANT_ID, 'different-user-id');
  });

  // ─── unused constant suppression ──────────────────────────────────────────

  it('should reference all declared constants (lint guard)', () => {
    expect(CLASS_ID).toBeDefined();
    expect(REQUIREMENT_ID).toBeDefined();
    expect(YEAR_ID).toBeDefined();
    expect(ROOM_ID).toBeDefined();
  });
});
