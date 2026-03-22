import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CompensationService } from './compensation.service';

// Mock createRlsClient
const mockTx: Record<string, unknown> = {};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

describe('CompensationService', () => {
  let service: CompensationService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_PROFILE_ID = '33333333-3333-3333-3333-333333333333';
  const COMP_ID = '44444444-4444-4444-4444-444444444444';

  const mockPrisma = {
    staffCompensation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    staffProfile: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Wire mockTx to the same mocks used by the service inside transactions
    mockTx['staffProfile'] = mockPrisma.staffProfile;
    mockTx['staffCompensation'] = mockPrisma.staffCompensation;

    const module = await Test.createTestingModule({
      providers: [
        CompensationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompensationService>(CompensationService);
  });

  describe('createCompensation', () => {
    const baseSalariedDto = {
      staff_profile_id: STAFF_PROFILE_ID,
      compensation_type: 'salaried' as const,
      base_salary: 5000,
      per_class_rate: null,
      assigned_class_count: null,
      bonus_class_rate: null,
      bonus_day_multiplier: 1.5,
      effective_from: '2026-03-01',
    };

    it('should create a salaried compensation record', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
      });

      // No existing active compensation
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'salaried',
        base_salary: 5000,
        per_class_rate: null,
        assigned_class_count: null,
        bonus_class_rate: null,
        bonus_day_multiplier: 1.5,
        effective_from: new Date('2026-03-01'),
        effective_to: null,
        created_by_user_id: USER_ID,
        staff_profile: {
          id: STAFF_PROFILE_ID,
          staff_number: 'STF-001',
          job_title: 'Teacher',
          department: 'Math',
          user: { id: USER_ID, first_name: 'Ali', last_name: 'Khan', email: 'ali@test.com' },
        },
      };
      mockPrisma.staffCompensation.create.mockResolvedValue(createdRecord);

      const result = await service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto) as Record<string, unknown>;

      expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith({
        where: { id: STAFF_PROFILE_ID, tenant_id: TENANT_ID },
      });
      expect(mockPrisma.staffCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            staff_profile_id: STAFF_PROFILE_ID,
            compensation_type: 'salaried',
            base_salary: 5000,
            effective_to: null,
            created_by_user_id: USER_ID,
          }),
        }),
      );
      expect(result).toHaveProperty('id', COMP_ID);
      // Decimal fields should be serialized to numbers
      expect(result['base_salary']).toBe(5000);
      expect(result['bonus_day_multiplier']).toBe(1.5);
    });

    it('should create a per_class compensation record', async () => {
      const perClassDto = {
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'per_class' as const,
        base_salary: null,
        per_class_rate: 200,
        assigned_class_count: 20,
        bonus_class_rate: 250,
        bonus_day_multiplier: 0,
        effective_from: '2026-04-01',
      };

      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'per_class',
        base_salary: null,
        per_class_rate: 200,
        assigned_class_count: 20,
        bonus_class_rate: 250,
        bonus_day_multiplier: null,
        effective_from: new Date('2026-04-01'),
        effective_to: null,
        created_by_user_id: USER_ID,
        staff_profile: {
          id: STAFF_PROFILE_ID,
          staff_number: 'STF-001',
          job_title: 'Teacher',
          department: 'Math',
          user: { id: USER_ID, first_name: 'Ali', last_name: 'Khan', email: 'ali@test.com' },
        },
      };
      mockPrisma.staffCompensation.create.mockResolvedValue(createdRecord);

      const result = await service.createCompensation(TENANT_ID, USER_ID, perClassDto) as Record<string, unknown>;

      expect(mockPrisma.staffCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            compensation_type: 'per_class',
            per_class_rate: 200,
            assigned_class_count: 20,
            bonus_class_rate: 250,
          }),
        }),
      );
      expect(result['per_class_rate']).toBe(200);
      expect(result['bonus_class_rate']).toBe(250);
    });

    it('should auto-close previous active record when creating new one', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
      });

      const existingActiveComp = {
        id: '55555555-5555-5555-5555-555555555555',
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        effective_from: new Date('2026-01-01'),
        effective_to: null,
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existingActiveComp);
      mockPrisma.staffCompensation.update.mockResolvedValue({});

      const createdRecord = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'salaried',
        base_salary: 6000,
        per_class_rate: null,
        assigned_class_count: null,
        bonus_class_rate: null,
        bonus_day_multiplier: 1.0,
        effective_from: new Date('2026-03-01'),
        effective_to: null,
        created_by_user_id: USER_ID,
        staff_profile: {
          id: STAFF_PROFILE_ID,
          staff_number: 'STF-001',
          job_title: 'Teacher',
          department: 'Math',
          user: { id: USER_ID, first_name: 'Ali', last_name: 'Khan', email: 'ali@test.com' },
        },
      };
      mockPrisma.staffCompensation.create.mockResolvedValue(createdRecord);

      await service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto);

      // Verify the existing active compensation was closed
      expect(mockPrisma.staffCompensation.update).toHaveBeenCalledWith({
        where: { id: existingActiveComp.id },
        data: { effective_to: expect.any(Date) },
      });

      // The closing date should be the day before the new effective_from (2026-02-28)
      const updateCall = mockPrisma.staffCompensation.update.mock.calls[0][0] as {
        data: { effective_to: Date };
      };
      const closingDate = updateCall.data.effective_to;
      expect(closingDate.getFullYear()).toBe(2026);
      expect(closingDate.getMonth()).toBe(1); // February (0-indexed)
      expect(closingDate.getDate()).toBe(28);
    });

    it('should reject if staff_profile_id not found', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STAFF_PROFILE_NOT_FOUND' }),
      });

      expect(mockPrisma.staffCompensation.create).not.toHaveBeenCalled();
    });

    it('should reject when new effective date conflicts with existing active start date', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
      });

      // Existing compensation starts on 2026-03-01 — same as the new one
      const existingActiveComp = {
        id: '55555555-5555-5555-5555-555555555555',
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        effective_from: new Date('2026-03-01'),
        effective_to: null,
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existingActiveComp);

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EFFECTIVE_DATE_CONFLICT' }),
      });
    });
  });

  describe('getCompensation', () => {
    it('should throw NotFoundException when compensation not found', async () => {
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      await expect(
        service.getCompensation(TENANT_ID, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCompensation', () => {
    it('should throw ConflictException on concurrent modification', async () => {
      const existing = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateCompensation(TENANT_ID, COMP_ID, {
          expected_updated_at: '2026-02-28T00:00:00.000Z', // stale timestamp
          base_salary: 7000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
