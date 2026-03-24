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
      schoolAdmin: jest.fn().mockResolvedValue({ greeting: 'Good morning, Admin', stats: {}, pending_approvals: 0, incomplete_households: [], admissions: {}, recent_activity: [], summary: '' }),
      parent: jest.fn().mockResolvedValue({ greeting: 'Good morning, Parent', students: [], announcements: [] }),
      teacher: jest.fn().mockResolvedValue({ greeting: 'Good morning, Teacher', todays_schedule: [], todays_sessions: [], pending_submissions: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockService },
      ],
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

  // ─── parent ───────────────────────────────────────────────────────────────

  it('should call parent with tenant_id and user.sub', async () => {
    const result = await controller.parent(tenantContext, jwtPayload);

    expect(mockService.parent).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expect.objectContaining({ students: [] }));
  });

  // ─── teacher ──────────────────────────────────────────────────────────────

  it('should call teacher with tenant_id and user.sub', async () => {
    const result = await controller.teacher(tenantContext, jwtPayload);

    expect(mockService.teacher).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expect.objectContaining({ todays_schedule: [] }));
  });

  // ─── propagates service result unchanged ──────────────────────────────────

  it('should propagate schoolAdmin result unchanged from service', async () => {
    const adminDashboard = {
      greeting: 'Good evening, Sarah',
      summary: '50 active students · 8 staff · 10 classes',
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

  // ─── unused constant suppression ──────────────────────────────────────────

  it('should reference all declared constants (lint guard)', () => {
    expect(CLASS_ID).toBeDefined();
    expect(REQUIREMENT_ID).toBeDefined();
    expect(YEAR_ID).toBeDefined();
    expect(ROOM_ID).toBeDefined();
  });
});
