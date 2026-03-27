import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import type { DsarReviewRow } from '../services/pastoral-dsar.service';
import { PastoralDsarService } from '../services/pastoral-dsar.service';

import { PastoralDsarController } from './pastoral-dsar.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const REVIEW_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COMPLIANCE_REQUEST_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'test@example.com',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock Service ────────────────────────────────────────────────────────────

const mockDsarService = {
  listReviews: jest.fn(),
  getReview: jest.fn(),
  submitDecision: jest.fn(),
  getReviewsByRequest: jest.fn(),
  allReviewsComplete: jest.fn(),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('PastoralDsarController', () => {
  let controller: PastoralDsarController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PastoralDsarController],
      providers: [
        { provide: PastoralDsarService, useValue: mockDsarService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PastoralDsarController>(PastoralDsarController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS-LEVEL METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level metadata', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, PastoralDsarController);
      expect(moduleKey).toBe('pastoral');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PERMISSION METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('endpoint permission metadata', () => {
    it('should require pastoral.dsar_review on list', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralDsarController.prototype.list,
      );
      expect(permission).toBe('pastoral.dsar_review');
    });

    it('should require pastoral.dsar_review on getOne', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralDsarController.prototype.getOne,
      );
      expect(permission).toBe('pastoral.dsar_review');
    });

    it('should require pastoral.dsar_review on decide', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralDsarController.prototype.decide,
      );
      expect(permission).toBe('pastoral.dsar_review');
    });

    it('should require pastoral.dsar_review on byRequest', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralDsarController.prototype.byRequest,
      );
      expect(permission).toBe('pastoral.dsar_review');
    });

    it('should require pastoral.dsar_review on summary', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        PastoralDsarController.prototype.summary,
      );
      expect(permission).toBe('pastoral.dsar_review');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('list', () => {
    it('should delegate to dsarService.listReviews', async () => {
      const filters = { page: 1, pageSize: 20, sort: 'created_at' as const, order: 'desc' as const };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockDsarService.listReviews.mockResolvedValue(expected);

      const result = await controller.list(TENANT, USER, filters);

      expect(mockDsarService.listReviews).toHaveBeenCalledWith(TENANT_ID, USER_ID, filters);
      expect(result).toBe(expected);
    });
  });

  describe('getOne', () => {
    it('should delegate to dsarService.getReview', async () => {
      const expected = { id: REVIEW_ID, decision: null };
      mockDsarService.getReview.mockResolvedValue(expected);

      const result = await controller.getOne(TENANT, USER, REVIEW_ID);

      expect(mockDsarService.getReview).toHaveBeenCalledWith(TENANT_ID, USER_ID, REVIEW_ID);
      expect(result).toBe(expected);
    });
  });

  describe('decide', () => {
    it('should delegate to dsarService.submitDecision', async () => {
      const body = { decision: 'include' as const };
      const expected = { id: REVIEW_ID, decision: 'include' };
      mockDsarService.submitDecision.mockResolvedValue(expected);

      const result = await controller.decide(TENANT, USER, REVIEW_ID, body);

      expect(mockDsarService.submitDecision).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REVIEW_ID,
        body,
      );
      expect(result).toBe(expected);
    });
  });

  describe('byRequest', () => {
    it('should delegate to dsarService.getReviewsByRequest', async () => {
      const expected: DsarReviewRow[] = [];
      mockDsarService.getReviewsByRequest.mockResolvedValue(expected);

      const result = await controller.byRequest(TENANT, USER, COMPLIANCE_REQUEST_ID);

      expect(mockDsarService.getReviewsByRequest).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        COMPLIANCE_REQUEST_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('summary', () => {
    it('should delegate to dsarService.getReviewsByRequest and allReviewsComplete', async () => {
      const reviews: DsarReviewRow[] = [
        { id: '11111111-1111-1111-1111-111111111111', decision: 'include' } as DsarReviewRow,
        { id: '22222222-2222-2222-2222-222222222222', decision: 'redact' } as DsarReviewRow,
        { id: '33333333-3333-3333-3333-333333333333', decision: 'exclude' } as DsarReviewRow,
        { id: '44444444-4444-4444-4444-444444444444', decision: null } as DsarReviewRow,
      ];
      mockDsarService.getReviewsByRequest.mockResolvedValue(reviews);
      mockDsarService.allReviewsComplete.mockResolvedValue(false);

      const result = await controller.summary(TENANT, USER, COMPLIANCE_REQUEST_ID);

      expect(mockDsarService.getReviewsByRequest).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        COMPLIANCE_REQUEST_ID,
      );
      expect(mockDsarService.allReviewsComplete).toHaveBeenCalledWith(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
      );
      expect(result).toEqual({
        total: 4,
        pending: 1,
        included: 1,
        redacted: 1,
        excluded: 1,
        all_complete: false,
      });
    });

    it('should compute correct counts when all reviews are complete', async () => {
      const reviews: DsarReviewRow[] = [
        { id: '11111111-1111-1111-1111-111111111111', decision: 'include' } as DsarReviewRow,
        { id: '22222222-2222-2222-2222-222222222222', decision: 'include' } as DsarReviewRow,
      ];
      mockDsarService.getReviewsByRequest.mockResolvedValue(reviews);
      mockDsarService.allReviewsComplete.mockResolvedValue(true);

      const result = await controller.summary(TENANT, USER, COMPLIANCE_REQUEST_ID);

      expect(result).toEqual({
        total: 2,
        pending: 0,
        included: 2,
        redacted: 0,
        excluded: 0,
        all_complete: true,
      });
    });
  });
});
