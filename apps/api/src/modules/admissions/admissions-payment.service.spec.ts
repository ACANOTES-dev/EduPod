/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { EncryptionService } from '../configuration/encryption.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsPaymentService } from './admissions-payment.service';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APP_ID = 'app-1';
const USER_ID = 'user-1';

function buildApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    tenant_id: TENANT_ID,
    status: 'draft',
    submitted_by_parent_id: null,
    reviewed_by_user_id: null,
    payment_status: null,
    payment_amount: null,
    discount_applied: null,
    payment_deadline: null,
    stripe_payment_intent_id: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AdmissionsPaymentService', () => {
  let service: AdmissionsPaymentService;
  let mockPrisma: {
    tenantStripeConfig: { findUnique: jest.Mock };
    application: { findFirst: jest.Mock; update: jest.Mock };
    applicationNote: { create: jest.Mock };
  };
  let mockEncryption: { decrypt: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let mockSettingsService: {
    getSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantStripeConfig: { findUnique: jest.fn() },
      application: { findFirst: jest.fn(), update: jest.fn() },
      applicationNote: { create: jest.fn() },
    };

    mockEncryption = { decrypt: jest.fn() };
    mockConfigService = { get: jest.fn() };
    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        admissions: {
          earlyBirdDiscounts: [],
          cashPaymentDeadlineDays: 14,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsPaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<AdmissionsPaymentService>(AdmissionsPaymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── calculateDiscount ────────────────────────────────────────────────────

  describe('AdmissionsPaymentService — calculateDiscount', () => {
    it('should return no discount when tiers are empty', () => {
      const result = service.calculateDiscount(500, []);
      expect(result).toEqual({
        discount_percent: 0,
        discount_amount: 0,
        final_amount: 500,
        tier_label: null,
      });
    });

    it('should apply discount when submission is before deadline', () => {
      const tiers = [{ deadline: '2026-06-01', discount_percent: 10, label: 'Early Bird' }];
      const submissionDate = new Date('2026-05-01');

      const result = service.calculateDiscount(1000, tiers, submissionDate);

      expect(result.discount_percent).toBe(10);
      expect(result.discount_amount).toBe(100);
      expect(result.final_amount).toBe(900);
      expect(result.tier_label).toBe('Early Bird');
    });

    it('should return no discount when submission is after all deadlines', () => {
      const tiers = [
        { deadline: '2026-01-01', discount_percent: 20, label: 'Super Early' },
        { deadline: '2026-03-01', discount_percent: 10, label: 'Early Bird' },
      ];
      const submissionDate = new Date('2026-06-01');

      const result = service.calculateDiscount(1000, tiers, submissionDate);

      expect(result.discount_percent).toBe(0);
      expect(result.discount_amount).toBe(0);
      expect(result.final_amount).toBe(1000);
      expect(result.tier_label).toBeNull();
    });

    it('should apply the highest applicable tier (first matching sorted by deadline)', () => {
      const tiers = [
        { deadline: '2026-06-01', discount_percent: 10, label: 'Standard Early' },
        { deadline: '2026-03-01', discount_percent: 20, label: 'Super Early' },
      ];
      const submissionDate = new Date('2026-02-15');

      const result = service.calculateDiscount(1000, tiers, submissionDate);

      // Should get 20% because 2026-02-15 < 2026-03-01 (Super Early is first after sorting)
      expect(result.discount_percent).toBe(20);
      expect(result.discount_amount).toBe(200);
      expect(result.final_amount).toBe(800);
      expect(result.tier_label).toBe('Super Early');
    });

    it('should apply second tier when first deadline has passed', () => {
      const tiers = [
        { deadline: '2026-03-01', discount_percent: 20, label: 'Super Early' },
        { deadline: '2026-06-01', discount_percent: 10, label: 'Standard Early' },
      ];
      const submissionDate = new Date('2026-04-15');

      const result = service.calculateDiscount(1000, tiers, submissionDate);

      expect(result.discount_percent).toBe(10);
      expect(result.final_amount).toBe(900);
      expect(result.tier_label).toBe('Standard Early');
    });

    it('edge: should handle zero fee amount', () => {
      const tiers = [{ deadline: '2026-06-01', discount_percent: 10, label: 'Early' }];
      const result = service.calculateDiscount(0, tiers, new Date('2026-01-01'));

      expect(result.discount_amount).toBe(0);
      expect(result.final_amount).toBe(0);
    });

    it('edge: should round discount amounts to 2 decimal places', () => {
      const tiers = [{ deadline: '2026-06-01', discount_percent: 15, label: 'Early Bird' }];
      // 333 * 15% = 49.95 exactly
      const result = service.calculateDiscount(333, tiers, new Date('2026-01-01'));

      expect(result.discount_amount).toBe(49.95);
      expect(result.final_amount).toBe(283.05);
    });
  });

  // ─── markPaymentReceived ──────────────────────────────────────────────────

  describe('AdmissionsPaymentService — markPaymentReceived', () => {
    it('should transition draft to submitted with paid_cash', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        payment_status: 'paid_cash',
      });
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = await service.markPaymentReceived(TENANT_ID, APP_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'submitted',
            payment_status: 'paid_cash',
          }),
        }),
      );
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: expect.stringContaining('Cash payment received'),
            is_internal: true,
          }),
        }),
      );
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.markPaymentReceived(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject non-draft applications', async () => {
      const app = buildApplication({ status: 'submitted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.markPaymentReceived(TENANT_ID, APP_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── setupPaymentPlan ──────────────────────────────────────────────────────

  describe('AdmissionsPaymentService — setupPaymentPlan', () => {
    it('should transition draft to submitted with payment_plan', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        payment_status: 'payment_plan',
      });
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = await service.setupPaymentPlan(TENANT_ID, APP_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'submitted',
            payment_status: 'payment_plan',
          }),
        }),
      );
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.setupPaymentPlan(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject non-draft applications', async () => {
      const app = buildApplication({ status: 'under_review' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.setupPaymentPlan(TENANT_ID, APP_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── waiveFees ──────────────────────────────────────────────────────────────

  describe('AdmissionsPaymentService — waiveFees', () => {
    it('should transition draft to submitted with waived status and zero amount', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        payment_status: 'waived',
        payment_amount: 0,
      });
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = await service.waiveFees(TENANT_ID, APP_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'submitted',
            payment_status: 'waived',
            payment_amount: 0,
          }),
        }),
      );
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: expect.stringContaining('Fees waived'),
          }),
        }),
      );
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.waiveFees(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject non-draft applications', async () => {
      const app = buildApplication({ status: 'accepted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.waiveFees(TENANT_ID, APP_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── handlePaymentConfirmed ───────────────────────────────────────────────

  describe('AdmissionsPaymentService — handlePaymentConfirmed', () => {
    it('should transition draft application to submitted on payment confirmation', async () => {
      const app = buildApplication({
        status: 'draft',
        stripe_payment_intent_id: 'pi_123',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        payment_status: 'paid_online',
      });
      mockPrisma.applicationNote.create.mockResolvedValue({});

      await service.handlePaymentConfirmed('pi_123');

      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'submitted',
            payment_status: 'paid_online',
          }),
        }),
      );
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: expect.stringContaining('Online payment confirmed'),
            is_internal: true,
          }),
        }),
      );
    });

    it('should do nothing if no application found for payment intent', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await service.handlePaymentConfirmed('pi_unknown');

      expect(mockPrisma.application.update).not.toHaveBeenCalled();
    });

    it('should skip if application already submitted', async () => {
      const app = buildApplication({
        status: 'submitted',
        stripe_payment_intent_id: 'pi_123',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await service.handlePaymentConfirmed('pi_123');

      expect(mockPrisma.application.update).not.toHaveBeenCalled();
    });
  });

  // ─── selectCashOption ──────────────────────────────────────────────────────

  describe('AdmissionsPaymentService — selectCashOption', () => {
    it('should set payment deadline and pending status', async () => {
      mockPrisma.application.update.mockResolvedValue({});

      const result = await service.selectCashOption(TENANT_ID, APP_ID, 500);

      expect(result.payment_deadline).toBeInstanceOf(Date);
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payment_status: 'pending',
            payment_amount: 500,
          }),
        }),
      );
    });

    it('should apply early bird discount when tiers configured', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        admissions: {
          earlyBirdDiscounts: [{ deadline: '2030-12-31', discount_percent: 10, label: 'Early' }],
          cashPaymentDeadlineDays: 7,
        },
      });
      mockPrisma.application.update.mockResolvedValue({});

      await service.selectCashOption(TENANT_ID, APP_ID, 1000);

      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payment_amount: 900,
            discount_applied: 100,
          }),
        }),
      );
    });
  });
});
