import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AiFlagGuard } from '../ai-flags/decorators/ai-flag.guard';

import { AiPredictionsController } from './ai-predictions.controller';
import { AiPredictionsService } from './ai-predictions.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const tenantStub: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS Test',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const userStub: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  tenant_id: TENANT_ID,
  membership_id: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('AiPredictionsController', () => {
  let controller: AiPredictionsController;
  let service: jest.Mocked<AiPredictionsService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<AiPredictionsService>> = {
      predictStudentRisk: jest.fn().mockResolvedValue({
        risk_score: 65,
        narrative: 'Student shows declining trends.',
        factors: [{ label: 'Low attendance', weight: 'high' }],
        confidence: 'high',
        generated_at: new Date().toISOString(),
        cache_hit: false,
      }),
      forecastAttendance: jest.fn().mockResolvedValue({
        forecast: [
          { week_start: '2026-05-04', predicted_rate: 92, confidence_interval: [88, 96] },
        ],
        narrative: 'Stable attendance expected.',
        confidence: 'high',
        generated_at: new Date().toISOString(),
        cache_hit: false,
      }),
      forecastCashFlow: jest.fn().mockResolvedValue({
        forecast: [
          { date: '2026-05-04', expected_receipts: 5000, confidence_interval: [4000, 6000] },
        ],
        narrative: 'Positive cash flow expected.',
        confidence: 'medium',
        generated_at: new Date().toISOString(),
        cache_hit: false,
      }),
      bulkPredictStudentRisk: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, generated_at: new Date().toISOString() },
      }),
    };

    // The controller stacks AuthGuard + PermissionGuard + AiFlagGuard via
    // `@UseGuards(...)` at class scope. Overriding them with a stub
    // `canActivate: () => true` lets the unit test exercise the route
    // dispatch logic without instantiating the full DI graph.
    const module = await Test.createTestingModule({
      controllers: [AiPredictionsController],
      providers: [{ provide: AiPredictionsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AiFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AiPredictionsController);
    service = module.get(AiPredictionsService) as jest.Mocked<AiPredictionsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('predictStudentRisk', () => {
    it('forwards tenant + user + studentId, refresh=false by default', async () => {
      await controller.predictStudentRisk(tenantStub, userStub, STUDENT_ID, undefined);
      expect(service.predictStudentRisk).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        false,
      );
    });

    it('passes refresh=true when query is "true"', async () => {
      await controller.predictStudentRisk(tenantStub, userStub, STUDENT_ID, 'true');
      expect(service.predictStudentRisk).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        true,
      );
    });

    it('treats other refresh values as false', async () => {
      await controller.predictStudentRisk(tenantStub, userStub, STUDENT_ID, '1');
      expect(service.predictStudentRisk).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        false,
      );
    });
  });

  describe('forecastAttendance', () => {
    it('uses default 4 weeks when not provided', async () => {
      await controller.forecastAttendance(tenantStub, userStub, YEAR_GROUP_ID, undefined);
      expect(service.forecastAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        4,
        false,
      );
    });

    it('clamps weeks > 52 to 52', async () => {
      await controller.forecastAttendance(tenantStub, userStub, YEAR_GROUP_ID, '100');
      expect(service.forecastAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        52,
        false,
      );
    });

    it('clamps weeks < 1 to 1 (parses as default and clamps)', async () => {
      await controller.forecastAttendance(tenantStub, userStub, YEAR_GROUP_ID, '0');
      expect(service.forecastAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        4,
        false,
      );
    });

    it('passes refresh=true when set', async () => {
      await controller.forecastAttendance(tenantStub, userStub, YEAR_GROUP_ID, '8', 'true');
      expect(service.forecastAttendance).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        8,
        true,
      );
    });
  });

  describe('forecastCashFlow', () => {
    it('uses default 30 days when not provided', async () => {
      await controller.forecastCashFlow(tenantStub, userStub, undefined);
      expect(service.forecastCashFlow).toHaveBeenCalledWith(TENANT_ID, USER_ID, 30, false);
    });

    it('clamps days > 365 to 365', async () => {
      await controller.forecastCashFlow(tenantStub, userStub, '500');
      expect(service.forecastCashFlow).toHaveBeenCalledWith(TENANT_ID, USER_ID, 365, false);
    });

    it('passes refresh=true when set', async () => {
      await controller.forecastCashFlow(tenantStub, userStub, '14', 'true');
      expect(service.forecastCashFlow).toHaveBeenCalledWith(TENANT_ID, USER_ID, 14, true);
    });
  });

  describe('bulkStudentRisk', () => {
    it('forwards year_group_id + page + pageSize + refresh', async () => {
      await controller.bulkStudentRisk(
        tenantStub,
        userStub,
        YEAR_GROUP_ID,
        '2',
        '10',
        'true',
      );
      expect(service.bulkPredictStudentRisk).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        2,
        10,
        true,
      );
    });

    it('uses default page=1 / pageSize=20 when not provided', async () => {
      await controller.bulkStudentRisk(tenantStub, userStub, YEAR_GROUP_ID);
      expect(service.bulkPredictStudentRisk).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        YEAR_GROUP_ID,
        1,
        20,
        false,
      );
    });

    it('rejects when year_group_id is missing', async () => {
      await expect(
        controller.bulkStudentRisk(tenantStub, userStub, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.bulkPredictStudentRisk).not.toHaveBeenCalled();
    });
  });
});
