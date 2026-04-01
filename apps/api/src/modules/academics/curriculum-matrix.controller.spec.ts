/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurriculumMatrixController } from './curriculum-matrix.controller';
import type { MatrixData } from './curriculum-matrix.service';
import { CurriculumMatrixService } from './curriculum-matrix.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SUBJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACADEMIC_YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONFIG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

const tenantContext: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const userPayload: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@test.com',
  tenant_id: TENANT_ID,
  membership_id: '44444444-4444-4444-4444-444444444444',
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// ─── Mock service ─────────────────────────────────────────────────────────────

function buildMockService() {
  return {
    getMatrix: jest.fn(),
    toggle: jest.fn(),
    yearGroupAssign: jest.fn(),
    bulkCreateAssessments: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CurriculumMatrixController', () => {
  let controller: CurriculumMatrixController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurriculumMatrixController],
      providers: [{ provide: CurriculumMatrixService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CurriculumMatrixController>(CurriculumMatrixController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMatrix ───────────────────────────────────────────────────────────

  describe('getMatrix', () => {
    it('should call service.getMatrix with tenant_id and no academic_year_id', async () => {
      const expected: MatrixData = {
        classes: [],
        subjects: [],
        assignments: [],
      };
      service.getMatrix.mockResolvedValue(expected);

      const result = await controller.getMatrix(tenantContext, {});

      expect(result).toEqual(expected);
      expect(service.getMatrix).toHaveBeenCalledWith(TENANT_ID, undefined);
    });

    it('should call service.getMatrix with academic_year_id when provided', async () => {
      const expected: MatrixData = {
        classes: [
          {
            id: CLASS_ID,
            name: 'Class 1A',
            year_group: { id: YEAR_GROUP_ID, name: 'Year 1' },
            academic_year: { id: ACADEMIC_YEAR_ID, name: '2024-2025' },
          },
        ],
        subjects: [{ id: SUBJECT_ID, name: 'Mathematics', code: 'MATH' }],
        assignments: [{ class_id: CLASS_ID, subject_id: SUBJECT_ID, config_id: CONFIG_ID }],
      };
      service.getMatrix.mockResolvedValue(expected);

      const result = await controller.getMatrix(tenantContext, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      expect(result).toEqual(expected);
      expect(service.getMatrix).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID);
    });
  });

  // ─── toggle ──────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('should call service.toggle to enable a class+subject assignment', async () => {
      const expected = { enabled: true, config_id: CONFIG_ID };
      service.toggle.mockResolvedValue(expected);

      const result = await controller.toggle(tenantContext, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        enabled: true,
      });

      expect(result).toEqual(expected);
      expect(service.toggle).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, SUBJECT_ID, true);
    });

    it('should call service.toggle to disable a class+subject assignment', async () => {
      const expected = { enabled: false, config_id: null };
      service.toggle.mockResolvedValue(expected);

      const result = await controller.toggle(tenantContext, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        enabled: false,
      });

      expect(result).toEqual(expected);
      expect(service.toggle).toHaveBeenCalledWith(TENANT_ID, CLASS_ID, SUBJECT_ID, false);
    });
  });

  // ─── yearGroupAssign ─────────────────────────────────────────────────────

  describe('yearGroupAssign', () => {
    it('should call service.yearGroupAssign with correct parameters', async () => {
      const expected = { created: 3, removed: 1 };
      service.yearGroupAssign.mockResolvedValue(expected);

      const assignments = [{ subject_id: SUBJECT_ID, enabled: true }];

      const result = await controller.yearGroupAssign(tenantContext, {
        academic_year_id: ACADEMIC_YEAR_ID,
        year_group_id: YEAR_GROUP_ID,
        assignments,
      });

      expect(result).toEqual(expected);
      expect(service.yearGroupAssign).toHaveBeenCalledWith(
        TENANT_ID,
        ACADEMIC_YEAR_ID,
        YEAR_GROUP_ID,
        assignments,
      );
    });
  });

  // ─── bulkCreateAssessments ───────────────────────────────────────────────

  describe('bulkCreateAssessments', () => {
    it('should call service.bulkCreateAssessments with tenant, user, and body', async () => {
      const expected = { created: 5, skipped: 2 };
      service.bulkCreateAssessments.mockResolvedValue(expected);

      const body = {
        class_ids: [CLASS_ID],
        subject_ids: [SUBJECT_ID],
        academic_period_id: PERIOD_ID,
        category_id: CATEGORY_ID,
        title: 'Final Exam',
        max_score: 100,
        due_date: null,
      };

      const result = await controller.bulkCreateAssessments(tenantContext, userPayload, body);

      expect(result).toEqual(expected);
      expect(service.bulkCreateAssessments).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
    });

    it('should pass through due_date when provided', async () => {
      const expected = { created: 1, skipped: 0 };
      service.bulkCreateAssessments.mockResolvedValue(expected);

      const body = {
        class_ids: [CLASS_ID],
        subject_ids: [SUBJECT_ID],
        academic_period_id: PERIOD_ID,
        category_id: CATEGORY_ID,
        title: 'Quiz 1',
        max_score: 20,
        due_date: '2025-03-15',
      };

      await controller.bulkCreateAssessments(tenantContext, userPayload, body);

      expect(service.bulkCreateAssessments).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
    });
  });
});
