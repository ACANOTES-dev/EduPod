/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware');

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { SafeguardingReferralsService } from './safeguarding-referrals.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const CONCERN_ID = 'concern-1';

const makeActiveConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  status: 'under_investigation',
  ...overrides,
});

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockDb = () => ({
  safeguardingConcern: {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  safeguardingAction: {
    create: jest.fn().mockResolvedValue({}),
  },
});

describe('SafeguardingReferralsService', () => {
  let service: SafeguardingReferralsService;
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(async () => {
    mockDb = makeMockDb();

    const mockTx = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    });

    (createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockTx });

    const module: TestingModule = await Test.createTestingModule({
      providers: [SafeguardingReferralsService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<SafeguardingReferralsService>(SafeguardingReferralsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── recordTuslaReferral ───────────────────────────────────────────────

  describe('SafeguardingReferralsService -- recordTuslaReferral', () => {
    const dto = {
      reference_number: 'TUSLA-2026-001',
      referred_at: '2026-04-01T10:00:00.000Z',
    };

    it('should record a Tusla referral on an active concern', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(makeActiveConcern());

      const result = await service.recordTuslaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto);

      expect(result).toEqual({ data: { success: true } });
      expect(mockDb.safeguardingConcern.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          is_tusla_referral: true,
          tusla_reference_number: 'TUSLA-2026-001',
        }),
      });
      expect(mockDb.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'tusla_referred',
            concern_id: CONCERN_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.recordTuslaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeActiveConcern({ status: 'sealed' }),
      );

      await expect(
        service.recordTuslaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── recordGardaReferral ───────────────────────────────────────────────

  describe('SafeguardingReferralsService -- recordGardaReferral', () => {
    const dto = {
      reference_number: 'GARDA-2026-042',
      referred_at: '2026-04-02T14:30:00.000Z',
    };

    it('should record a Garda referral on an active concern', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(makeActiveConcern());

      const result = await service.recordGardaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto);

      expect(result).toEqual({ data: { success: true } });
      expect(mockDb.safeguardingConcern.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          is_garda_referral: true,
          garda_reference_number: 'GARDA-2026-042',
        }),
      });
      expect(mockDb.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'garda_referred',
            concern_id: CONCERN_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.recordGardaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeActiveConcern({ status: 'sealed' }),
      );

      await expect(
        service.recordGardaReferral(TENANT_ID, USER_ID, CONCERN_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
