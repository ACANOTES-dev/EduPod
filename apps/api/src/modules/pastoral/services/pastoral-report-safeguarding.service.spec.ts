import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportSafeguardingService } from './pastoral-report-safeguarding.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock DB ────────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  cpAccessGrant: { findFirst: jest.fn() },
  pastoralConcern: { count: jest.fn() },
  cpRecord: { findMany: jest.fn(), count: jest.fn() },
  staffProfile: { count: jest.fn() },
  pastoralCase: { count: jest.fn() },
});

type MockDb = ReturnType<typeof buildMockDb>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function setupWithCpAccess(db: MockDb): void {
  db.cpAccessGrant.findFirst.mockResolvedValue({ id: 'grant-1', revoked_at: null });
  db.pastoralConcern.count
    .mockResolvedValueOnce(10) // tier 1
    .mockResolvedValueOnce(5) // tier 2
    .mockResolvedValueOnce(3); // tier 3
  db.cpRecord.findMany.mockResolvedValue([
    { mandated_report_status: 'submitted' },
    { mandated_report_status: 'submitted' },
    { mandated_report_status: 'acknowledged' },
  ]);
  db.staffProfile.count.mockResolvedValue(20);
  db.pastoralCase.count.mockResolvedValue(2);
}

function setupWithoutCpAccess(db: MockDb): void {
  db.cpAccessGrant.findFirst.mockResolvedValue(null);
  db.pastoralConcern.count
    .mockResolvedValueOnce(10) // tier 1
    .mockResolvedValueOnce(5); // tier 2
  db.staffProfile.count.mockResolvedValue(20);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportSafeguardingService', () => {
  let service: PastoralReportSafeguardingService;
  let mockEventService: { write: jest.Mock };
  let mockDb: MockDb;

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportSafeguardingService,
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportSafeguardingService>(PastoralReportSafeguardingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── build ──────────────────────────────────────────────────────────────

  describe('PastoralReportSafeguardingService — build', () => {
    it('should return report with tier counts', async () => {
      setupWithCpAccess(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.period).toEqual({ from: '2025-04-01', to: '2026-03-31' });
      expect(result.concern_counts.tier_1).toBe(10);
      expect(result.concern_counts.tier_2).toBe(5);
    });

    it('should include tier 3 data when user has CP access', async () => {
      setupWithCpAccess(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.concern_counts.tier_3).toBe(3);
    });

    it('should exclude tier 3 and mandated reports when no CP access', async () => {
      setupWithoutCpAccess(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.concern_counts.tier_3).toBeNull();
      expect(result.mandated_reports).toBeNull();
      expect(result.active_cp_cases).toBeNull();
    });

    it('should include mandated reports by status for CP users', async () => {
      setupWithCpAccess(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.mandated_reports).toEqual({
        total: 3,
        by_status: { submitted: 2, acknowledged: 1 },
      });
    });

    it('should include active CP case count for CP users', async () => {
      setupWithCpAccess(mockDb);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });

      expect(result.active_cp_cases).toBe(2);
    });

    it('should fire audit event', async () => {
      setupWithoutCpAccess(mockDb);

      const filters = { from_date: '2025-04-01', to_date: '2026-03-31' };
      await service.build(mockDb as never, TENANT_ID, USER_ID, filters);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'report_generated',
          actor_user_id: USER_ID,
          payload: expect.objectContaining({
            report_type: 'safeguarding_compliance',
          }),
        }),
      );
    });
  });
});
