import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  HOUSEHOLD_MAX_STUDENTS,
  HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS,
  HOUSEHOLD_NUMBER_PATTERN,
} from '@school/shared/households/household-number';

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
    $queryRaw: jest.fn(),
  };
}

function buildMockSequenceService() {
  return {
    nextNumber: jest.fn().mockResolvedValue('STU-000042'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HouseholdNumberService', () => {
  let service: HouseholdNumberService;
  let mockSequence: ReturnType<typeof buildMockSequenceService>;

  beforeEach(async () => {
    mockSequence = buildMockSequenceService();

    const module = await Test.createTestingModule({
      providers: [HouseholdNumberService, { provide: SequenceService, useValue: mockSequence }],
    }).compile();

    service = module.get(HouseholdNumberService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateUniqueForTenant ──────────────────────────────────────────────

  describe('generateUniqueForTenant', () => {
    it('should return a value matching the AAA999 format', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue(null);

      const result = await service.generateUniqueForTenant(tx as never, TENANT_ID);

      expect(result).toMatch(HOUSEHOLD_NUMBER_PATTERN);
      expect(result).toHaveLength(6);
    });

    it('should retry on collision and return a unique value', async () => {
      const tx = buildMockTx();
      // First attempt: collision (existing household found)
      tx.household.findFirst.mockResolvedValueOnce({ id: 'existing' });
      // Second attempt: no collision
      tx.household.findFirst.mockResolvedValueOnce(null);

      const result = await service.generateUniqueForTenant(tx as never, TENANT_ID);

      expect(result).toMatch(HOUSEHOLD_NUMBER_PATTERN);
      expect(tx.household.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should throw HOUSEHOLD_NUMBER_GENERATION_EXHAUSTED after max attempts', async () => {
      const tx = buildMockTx();
      // All attempts collide
      for (let i = 0; i < HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS; i++) {
        tx.household.findFirst.mockResolvedValueOnce({ id: 'existing' });
      }

      await expect(service.generateUniqueForTenant(tx as never, TENANT_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(tx.household.findFirst).toHaveBeenCalledTimes(
        HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS,
      );
    });

    it('should check within the correct tenant scope', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue(null);

      await service.generateUniqueForTenant(tx as never, TENANT_ID);

      expect(tx.household.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });
  });

  // ─── previewForTenant ─────────────────────────────────────────────────────

  describe('previewForTenant', () => {
    it('should return a valid household number', async () => {
      const tx = buildMockTx();
      tx.household.findFirst.mockResolvedValue(null);

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
