import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  HOUSEHOLD_MAX_STUDENTS,
  HOUSEHOLD_NUMBER_PATTERN,
} from '@school/shared/households/household-number';

import { TenantCodePoolService } from '../../common/services/tenant-code-pool.service';
import { SequenceService } from '../sequence/sequence.service';

import { HouseholdNumberService } from './household-number.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock tx ─────────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    household: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    staffProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn(),
  };
}

function buildMockSequenceService() {
  return {
    nextNumber: jest.fn().mockResolvedValue('STU-000042'),
  };
}

function buildMockPool() {
  let attempt = 0;
  return {
    generateUnique: jest.fn().mockImplementation(() => {
      attempt += 1;
      return Promise.resolve(`ABC${String(attempt).padStart(3, '0')}`);
    }),
    isTaken: jest.fn().mockResolvedValue(false),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HouseholdNumberService', () => {
  let service: HouseholdNumberService;
  let mockSequence: ReturnType<typeof buildMockSequenceService>;
  let mockPool: ReturnType<typeof buildMockPool>;

  beforeEach(async () => {
    mockSequence = buildMockSequenceService();
    mockPool = buildMockPool();

    const module = await Test.createTestingModule({
      providers: [
        HouseholdNumberService,
        { provide: SequenceService, useValue: mockSequence },
        { provide: TenantCodePoolService, useValue: mockPool },
      ],
    }).compile();

    service = module.get(HouseholdNumberService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateUniqueForTenant ──────────────────────────────────────────────

  describe('generateUniqueForTenant', () => {
    it('delegates to TenantCodePoolService.generateUnique', async () => {
      const tx = buildMockTx();
      mockPool.generateUnique.mockResolvedValueOnce('ABC123');

      const result = await service.generateUniqueForTenant(tx as never, TENANT_ID);

      expect(mockPool.generateUnique).toHaveBeenCalledWith(tx, TENANT_ID);
      expect(result).toBe('ABC123');
      expect(result).toMatch(HOUSEHOLD_NUMBER_PATTERN);
    });

    it('propagates errors from the pool service', async () => {
      const tx = buildMockTx();
      mockPool.generateUnique.mockRejectedValueOnce(new InternalServerErrorException('pool full'));

      await expect(service.generateUniqueForTenant(tx as never, TENANT_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── previewForTenant ─────────────────────────────────────────────────────

  describe('previewForTenant', () => {
    it('should return a valid household number', async () => {
      const tx = buildMockTx();
      mockPool.generateUnique.mockResolvedValueOnce('XYZ987');

      const result = await service.previewForTenant(tx as never, TENANT_ID);

      expect(result).toMatch(HOUSEHOLD_NUMBER_PATTERN);
    });
  });

  // ─── incrementStudentCounter ──────────────────────────────────────────────

  describe('incrementStudentCounter', () => {
    it('should return 1 on a fresh household (counter = 0)', async () => {
      const tx = buildMockTx();
      tx.$queryRaw.mockResolvedValue([{ student_counter: 0 }]);
      tx.household.update.mockResolvedValue({});

      const result = await service.incrementStudentCounter(tx as never, HOUSEHOLD_ID);

      expect(result).toBe(1);
      expect(tx.household.update).toHaveBeenCalledWith({
        where: { id: HOUSEHOLD_ID },
        data: { student_counter: 1 },
      });
    });

    it('should return 2 when counter is already 1', async () => {
      const tx = buildMockTx();
      tx.$queryRaw.mockResolvedValue([{ student_counter: 1 }]);
      tx.household.update.mockResolvedValue({});

      const result = await service.incrementStudentCounter(tx as never, HOUSEHOLD_ID);

      expect(result).toBe(2);
    });

    it('should return 3 when counter is already 2', async () => {
      const tx = buildMockTx();
      tx.$queryRaw.mockResolvedValue([{ student_counter: 2 }]);
      tx.household.update.mockResolvedValue({});

      const result = await service.incrementStudentCounter(tx as never, HOUSEHOLD_ID);

      expect(result).toBe(3);
    });

    it('should throw HOUSEHOLD_STUDENT_CAP_REACHED when next value would exceed 99', async () => {
      const tx = buildMockTx();
      tx.$queryRaw.mockResolvedValue([{ student_counter: HOUSEHOLD_MAX_STUDENTS }]);

      await expect(service.incrementStudentCounter(tx as never, HOUSEHOLD_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.household.update).not.toHaveBeenCalled();
    });

    it('should handle missing row gracefully (defaults counter to 0)', async () => {
      const tx = buildMockTx();
      tx.$queryRaw.mockResolvedValue([]);
      tx.household.update.mockResolvedValue({});

      const result = await service.incrementStudentCounter(tx as never, HOUSEHOLD_ID);

      expect(result).toBe(1);
    });
  });

  // ─── generateStudentNumber ────────────────────────────────────────────────

  describe('generateStudentNumber', () => {
    it('should return household-derived format when household has household_number', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_number: 'XYZ476',
      });
      // incrementStudentCounter mock
      tx.$queryRaw.mockResolvedValue([{ student_counter: 0 }]);
      tx.household.update.mockResolvedValue({});

      const result = await service.generateStudentNumber(tx as never, TENANT_ID, HOUSEHOLD_ID);

      expect(result).toBe('XYZ476-01');
    });

    it('should return XYZ476-02 for the second student in the household', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_number: 'XYZ476',
      });
      tx.$queryRaw.mockResolvedValue([{ student_counter: 1 }]);
      tx.household.update.mockResolvedValue({});

      const result = await service.generateStudentNumber(tx as never, TENANT_ID, HOUSEHOLD_ID);

      expect(result).toBe('XYZ476-02');
    });

    it('should fall back to STU-NNNNNN for households without household_number', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_number: null,
      });

      const result = await service.generateStudentNumber(tx as never, TENANT_ID, HOUSEHOLD_ID);

      expect(result).toBe('STU-000042');
      expect(mockSequence.nextNumber).toHaveBeenCalledWith(TENANT_ID, 'student', tx, 'STU');
    });

    it('should throw HOUSEHOLD_NOT_FOUND when household does not exist', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue(null);

      await expect(
        service.generateStudentNumber(tx as never, TENANT_ID, HOUSEHOLD_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when 100th student is added to a household', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_number: 'ABC123',
      });
      tx.$queryRaw.mockResolvedValue([{ student_counter: HOUSEHOLD_MAX_STUDENTS }]);

      await expect(
        service.generateStudentNumber(tx as never, TENANT_ID, HOUSEHOLD_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
