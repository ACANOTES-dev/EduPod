import { Test, TestingModule } from '@nestjs/testing';
import {
  ChildProtectionReviewStatus,
  DlpRole,
  StaffVettingStatus,
  StaffVettingType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SafeguardingReadFacade } from '../safeguarding/safeguarding-read.facade';

import { RegulatorySafeguardingService } from './regulatory-safeguarding.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => prisma,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DLP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const VETTING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REVIEW_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const buildMockFacade = () => ({
  countSafeguardingHub: jest.fn().mockResolvedValue(0),
  countPendingTuslaReferrals: jest.fn().mockResolvedValue(0),
  findRecentTuslaReferrals: jest.fn().mockResolvedValue([]),
  listTuslaReferrals: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
});

const buildMockPrisma = () => {
  const prisma = {
    staffVettingRecord: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    childProtectionReview: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    dlpRegisterEntry: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return prisma;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegulatorySafeguardingService', () => {
  let service: RegulatorySafeguardingService;
  let mockFacade: ReturnType<typeof buildMockFacade>;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockFacade = buildMockFacade();
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatorySafeguardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SafeguardingReadFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get(RegulatorySafeguardingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Dashboard ───────────────────────────────────────────────────────────

  describe('RegulatorySafeguardingService — getDashboard', () => {
    it('returns zero-state when the tenant has no data', async () => {
      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.open_concerns).toBe(0);
      expect(dashboard.pending_tusla_reports).toBe(0);
      expect(dashboard.vetting_expiring_soon).toBe(0);
      expect(dashboard.vetting_overdue).toBe(0);
      expect(dashboard.days_until_annual_review).toBeNull();
      expect(dashboard.next_review_due).toBeNull();
      expect(dashboard.last_review_date).toBeNull();
      expect(dashboard.active_dlp_count).toBe(0);
      expect(dashboard.deputy_dlp_count).toBe(0);
      expect(dashboard.recent_tusla_reports).toEqual([]);
    });

    it('computes days until annual review from the next scheduled review', async () => {
      const now = Date.now();
      const fortyDaysOut = new Date(now + 40 * 24 * 60 * 60 * 1000);

      mockPrisma.childProtectionReview.findFirst
        .mockResolvedValueOnce({ next_review_due: fortyDaysOut })
        .mockResolvedValueOnce(null);

      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.days_until_annual_review).toBe(40);
      expect(dashboard.next_review_due).toBe(fortyDaysOut.toISOString());
    });

    it('passes tenant through to the safeguarding facade', async () => {
      await service.getDashboard(TENANT_ID);

      expect(mockFacade.countSafeguardingHub).toHaveBeenCalledWith(TENANT_ID);
      expect(mockFacade.countPendingTuslaReferrals).toHaveBeenCalledWith(TENANT_ID);
      expect(mockFacade.findRecentTuslaReferrals).toHaveBeenCalledWith(TENANT_ID, 5);
    });

    it('maps recent Tusla referrals with iso-formatted timestamps', async () => {
      const ts = new Date('2026-04-20T10:00:00Z');
      mockFacade.findRecentTuslaReferrals.mockResolvedValueOnce([
        {
          id: 'inc-1',
          concern_number: 'SG-0001',
          severity: 'high',
          status: 'referred',
          tusla_referred_at: ts,
          tusla_reference_number: 'TUSLA-2026-001',
        },
      ]);

      const dashboard = await service.getDashboard(TENANT_ID);

      expect(dashboard.recent_tusla_reports).toHaveLength(1);
      expect(dashboard.recent_tusla_reports[0]).toMatchObject({
        id: 'inc-1',
        concern_number: 'SG-0001',
        severity: 'high',
        status: 'referred',
        tusla_referred_at: ts.toISOString(),
        tusla_reference_number: 'TUSLA-2026-001',
      });
    });
  });

  // ─── Mandatory Reports ───────────────────────────────────────────────────

  describe('RegulatorySafeguardingService — listMandatoryReports', () => {
    it('anonymises student ids to the first 8 characters', async () => {
      mockFacade.listTuslaReferrals.mockResolvedValueOnce({
        rows: [
          {
            id: 'inc-1',
            concern_number: 'SG-0001',
            student_id: '12345678-abcd-0000-0000-000000000000',
            concern_type: 'neglect',
            severity: 'medium',
            status: 'referred',
            tusla_referred_at: new Date('2026-04-10'),
            tusla_reference_number: 'TUSLA-2026-007',
            created_at: new Date('2026-04-01'),
          },
        ],
        total: 1,
      });

      const result = await service.listMandatoryReports(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.student_reference).toBe('12345678');
      expect(result.data[0]?.student_reference).not.toContain('-');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });

  // ─── DLP Register ────────────────────────────────────────────────────────

  describe('RegulatorySafeguardingService — DLP register', () => {
    it('lists DLP entries with user name flattened', async () => {
      mockPrisma.dlpRegisterEntry.findMany.mockResolvedValueOnce([
        {
          id: DLP_ID,
          user_id: USER_ID,
          role: DlpRole.designated_liaison,
          appointed_at: new Date('2025-09-01'),
          retired_at: null,
          notes: 'Primary DLP',
          user: {
            id: USER_ID,
            first_name: 'Aoife',
            last_name: "O'Brien",
            email: 'aoife@example.ie',
          },
        },
      ]);

      const result = await service.listDlpRegister(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: DLP_ID,
        user_id: USER_ID,
        user_name: "Aoife O'Brien",
        user_email: 'aoife@example.ie',
        role: DlpRole.designated_liaison,
        is_active: true,
        notes: 'Primary DLP',
      });
    });

    it('throws when updating a non-existent entry', async () => {
      mockPrisma.dlpRegisterEntry.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateDlpEntry(TENANT_ID, DLP_ID, { notes: 'test' }),
      ).rejects.toMatchObject({
        response: { code: 'DLP_ENTRY_NOT_FOUND' },
      });
    });
  });

  // ─── Staff Vetting ────────────────────────────────────────────────────────

  describe('RegulatorySafeguardingService — staff vetting', () => {
    it('auto-computes status as expiring_soon when expiry is inside 60 days', async () => {
      const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      mockPrisma.staffVettingRecord.create.mockResolvedValueOnce({
        id: VETTING_ID,
        user_id: USER_ID,
        vetting_type: StaffVettingType.garda_vetting,
        reference_number: 'GV-1',
        vetting_date: new Date('2023-04-01'),
        expiry_date: new Date(soon),
        status: StaffVettingStatus.expiring_soon,
        notes: null,
        user: { first_name: 'Liam', last_name: 'Murphy', email: 'liam@example.ie' },
      });

      const result = await service.createStaffVetting(TENANT_ID, {
        user_id: USER_ID,
        vetting_type: 'garda_vetting',
        reference_number: 'GV-1',
        vetting_date: '2023-04-01',
        expiry_date: soon,
        notes: null,
      });

      expect(result.status).toBe(StaffVettingStatus.expiring_soon);
      expect(mockPrisma.staffVettingRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: StaffVettingStatus.expiring_soon }),
        }),
      );
    });

    it('computes days_remaining from expiry_date', async () => {
      const expiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      mockPrisma.staffVettingRecord.findMany.mockResolvedValueOnce([
        {
          id: VETTING_ID,
          user_id: USER_ID,
          vetting_type: StaffVettingType.garda_vetting,
          reference_number: 'GV-2',
          vetting_date: new Date('2023-04-01'),
          expiry_date: expiry,
          status: StaffVettingStatus.active,
          notes: null,
          user: { first_name: 'Liam', last_name: 'Murphy', email: 'liam@example.ie' },
        },
      ]);

      const result = await service.listStaffVetting(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]?.days_remaining).toBeGreaterThanOrEqual(19);
      expect(result.data[0]?.days_remaining).toBeLessThanOrEqual(20);
    });
  });

  // ─── CP Reviews ──────────────────────────────────────────────────────────

  describe('RegulatorySafeguardingService — child protection reviews', () => {
    it('maps conducted_by to a flat name', async () => {
      mockPrisma.childProtectionReview.findMany.mockResolvedValueOnce([
        {
          id: REVIEW_ID,
          academic_year: '2025-2026',
          review_date: new Date('2026-01-15'),
          next_review_due: new Date('2027-01-15'),
          conducted_by_id: USER_ID,
          attendees: 'Principal, DLP, Board rep',
          findings: 'Policy up to date.',
          actions_required: 'None.',
          status: ChildProtectionReviewStatus.completed,
          conducted_by: { first_name: 'Niamh', last_name: 'Kelly' },
        },
      ]);

      const result = await service.listCpReviews(TENANT_ID);

      expect(result[0]).toMatchObject({
        id: REVIEW_ID,
        academic_year: '2025-2026',
        conducted_by_id: USER_ID,
        conducted_by_name: 'Niamh Kelly',
        status: ChildProtectionReviewStatus.completed,
      });
    });
  });
});
