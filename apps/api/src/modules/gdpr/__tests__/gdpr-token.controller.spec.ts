import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { GdprTokenController } from '../gdpr-token.controller';
import { GdprTokenService } from '../gdpr-token.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock Service ────────────────────────────────────────────────────────────

const mockGdprTokenService = {
  getExportPolicies: jest.fn(),
  getUsageLog: jest.fn(),
  getUsageStats: jest.fn(),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('GdprTokenController', () => {
  let controller: GdprTokenController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GdprTokenController],
      providers: [
        { provide: GdprTokenService, useValue: mockGdprTokenService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GdprTokenController>(GdprTokenController);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/v1/gdpr/export-policies
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getExportPolicies', () => {
    it('should call service.getExportPolicies() and return the result', async () => {
      const expected = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          export_type: 'ai_behaviour_analysis',
          tokenisation: 'always',
          lawful_basis: 'legitimate_interest',
          description: 'AI behaviour analysis export policy',
        },
      ];
      mockGdprTokenService.getExportPolicies.mockResolvedValue(expected);

      const result = await controller.getExportPolicies();

      expect(mockGdprTokenService.getExportPolicies).toHaveBeenCalledTimes(1);
      expect(mockGdprTokenService.getExportPolicies).toHaveBeenCalledWith();
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/v1/gdpr/token-usage
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getUsageLog', () => {
    it('should call service.getUsageLog(tenantId, query) with correct params', async () => {
      const query = {
        page: 1,
        pageSize: 20,
        export_type: 'ai_behaviour_analysis',
        date_from: '2026-01-01T00:00:00Z',
        date_to: '2026-03-31T23:59:59Z',
      };
      const expected = {
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            export_type: 'ai_behaviour_analysis',
            tokenised: true,
            policy_applied: 'always',
            lawful_basis: 'legitimate_interest',
            entity_count: 5,
            triggered_by: '33333333-3333-3333-3333-333333333333',
            override_by: null,
            override_reason: null,
            created_at: '2026-02-15T10:30:00Z',
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      };
      mockGdprTokenService.getUsageLog.mockResolvedValue(expected);

      const result = await controller.getUsageLog(TENANT, query);

      expect(mockGdprTokenService.getUsageLog).toHaveBeenCalledTimes(1);
      expect(mockGdprTokenService.getUsageLog).toHaveBeenCalledWith(
        TENANT_ID,
        query,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/v1/gdpr/token-usage/stats
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getUsageStats', () => {
    it('should call service.getUsageStats(tenantId, query) with correct params', async () => {
      const query = {
        date_from: '2026-01-01T00:00:00Z',
        date_to: '2026-03-31T23:59:59Z',
      };
      const expected = {
        totalTokensGenerated: 150,
        usageByService: [
          { service: 'ai_behaviour_analysis', count: 80 },
          { service: 'report_export', count: 70 },
        ],
        usageByMonth: [
          { month: '2026-01', count: 40 },
          { month: '2026-02', count: 55 },
          { month: '2026-03', count: 55 },
        ],
      };
      mockGdprTokenService.getUsageStats.mockResolvedValue(expected);

      const result = await controller.getUsageStats(TENANT, query);

      expect(mockGdprTokenService.getUsageStats).toHaveBeenCalledTimes(1);
      expect(mockGdprTokenService.getUsageStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
      );
      expect(result).toBe(expected);
    });
  });
});
