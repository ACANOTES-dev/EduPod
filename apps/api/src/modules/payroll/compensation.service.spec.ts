import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
      providers: [CompensationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CompensationService>(CompensationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createCompensation ────────────────────────────────────────────────

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

      const result = (await service.createCompensation(
        TENANT_ID,
        USER_ID,
        baseSalariedDto,
      )) as Record<string, unknown>;

      expect(result).toHaveProperty('id', COMP_ID);
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

      const result = (await service.createCompensation(TENANT_ID, USER_ID, perClassDto)) as Record<
        string,
        unknown
      >;

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

      expect(mockPrisma.staffCompensation.update).toHaveBeenCalledWith({
        where: { id: existingActiveComp.id },
        data: { effective_to: expect.any(Date) },
      });

      const updateCall = mockPrisma.staffCompensation.update.mock.calls[0][0] as {
        data: { effective_to: Date };
      };
      const closingDate = updateCall.data.effective_to;
      expect(closingDate.getFullYear()).toBe(2026);
      expect(closingDate.getMonth()).toBe(1);
      expect(closingDate.getDate()).toBe(28);
    });

    it('should reject if staff_profile_id not found', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STAFF_PROFILE_NOT_FOUND' }),
      });
    });

    it('should reject when new effective date conflicts with existing active start date', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
      });

      const existingActiveComp = {
        id: '55555555-5555-5555-5555-555555555555',
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        effective_from: new Date('2026-03-01'),
        effective_to: null,
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existingActiveComp);

      await expect(service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.createCompensation(TENANT_ID, USER_ID, baseSalariedDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EFFECTIVE_DATE_CONFLICT' }),
      });
    });
  });

  // ─── getCompensation ─────────────────────────────────────────────────────

  describe('getCompensation', () => {
    it('should throw NotFoundException when compensation not found', async () => {
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      await expect(service.getCompensation(TENANT_ID, 'nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return serialized compensation record', async () => {
      const record = {
        id: COMP_ID,
        base_salary: '5000.00',
        per_class_rate: null,
        bonus_class_rate: null,
        bonus_day_multiplier: '1.50',
        staff_profile: {
          id: STAFF_PROFILE_ID,
          staff_number: 'STF-001',
          job_title: 'Teacher',
          department: 'Math',
          user: { id: USER_ID, first_name: 'Ali', last_name: 'Khan', email: 'ali@test.com' },
        },
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(record);

      const result = (await service.getCompensation(TENANT_ID, COMP_ID)) as Record<string, unknown>;

      expect(result['base_salary']).toBe(5000);
      expect(result['bonus_day_multiplier']).toBe(1.5);
      expect(result['per_class_rate']).toBeNull();
    });
  });

  // ─── updateCompensation ──────────────────────────────────────────────────

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
          expected_updated_at: '2026-02-28T00:00:00.000Z',
          base_salary: 7000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCompensation(TENANT_ID, COMP_ID, {
          expected_updated_at: '2026-03-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update compensation_type when provided', async () => {
      const existing = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existing);
      mockPrisma.staffCompensation.update.mockResolvedValue({
        ...existing,
        compensation_type: 'per_class',
      });

      await service.updateCompensation(TENANT_ID, COMP_ID, {
        expected_updated_at: '2026-03-01T00:00:00.000Z',
        compensation_type: 'per_class',
      });

      expect(mockPrisma.staffCompensation.update).toHaveBeenCalledWith({
        where: { id: COMP_ID },
        data: expect.objectContaining({ compensation_type: 'per_class' }),
        include: expect.any(Object),
      });
    });

    it('should update all individual fields when provided', async () => {
      const existing = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existing);
      mockPrisma.staffCompensation.update.mockResolvedValue(existing);

      await service.updateCompensation(TENANT_ID, COMP_ID, {
        expected_updated_at: '2026-03-01T00:00:00.000Z',
        compensation_type: 'salaried',
        base_salary: 6000,
        per_class_rate: 100,
        assigned_class_count: 15,
        bonus_class_rate: 200,
        bonus_day_multiplier: 2.0,
        effective_from: '2026-04-01',
      });

      expect(mockPrisma.staffCompensation.update).toHaveBeenCalledWith({
        where: { id: COMP_ID },
        data: expect.objectContaining({
          compensation_type: 'salaried',
          base_salary: 6000,
          per_class_rate: 100,
          assigned_class_count: 15,
          bonus_class_rate: 200,
          bonus_day_multiplier: 2.0,
          effective_from: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });

    it('should not include undefined fields in update data', async () => {
      const existing = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existing);
      mockPrisma.staffCompensation.update.mockResolvedValue(existing);

      await service.updateCompensation(TENANT_ID, COMP_ID, {
        expected_updated_at: '2026-03-01T00:00:00.000Z',
        base_salary: 8000,
      });

      const updateData = (
        mockPrisma.staffCompensation.update.mock.calls[0][0] as {
          data: Record<string, unknown>;
        }
      ).data;
      expect(updateData).toHaveProperty('base_salary', 8000);
      expect(updateData).not.toHaveProperty('compensation_type');
      expect(updateData).not.toHaveProperty('per_class_rate');
    });
  });

  // ─── listCompensation ──��─────────────────────────────────────────────────

  describe('listCompensation', () => {
    it('should filter by compensation_type when provided', async () => {
      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);
      mockPrisma.staffCompensation.count.mockResolvedValue(0);

      await service.listCompensation(TENANT_ID, {
        page: 1,
        pageSize: 20,
        compensation_type: 'salaried',
        active_only: false,
      });

      expect(mockPrisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            compensation_type: 'salaried',
          }),
        }),
      );
    });

    it('should filter by staff_profile_id when provided', async () => {
      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);
      mockPrisma.staffCompensation.count.mockResolvedValue(0);

      await service.listCompensation(TENANT_ID, {
        page: 1,
        pageSize: 20,
        staff_profile_id: STAFF_PROFILE_ID,
        active_only: false,
      });

      expect(mockPrisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            staff_profile_id: STAFF_PROFILE_ID,
          }),
        }),
      );
    });

    it('should filter active_only when true', async () => {
      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);
      mockPrisma.staffCompensation.count.mockResolvedValue(0);

      await service.listCompensation(TENANT_ID, {
        page: 1,
        pageSize: 20,
        active_only: true,
      });

      expect(mockPrisma.staffCompensation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            effective_to: null,
          }),
        }),
      );
    });

    it('should not filter effective_to when active_only is false', async () => {
      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);
      mockPrisma.staffCompensation.count.mockResolvedValue(0);

      await service.listCompensation(TENANT_ID, {
        page: 1,
        pageSize: 20,
        active_only: false,
      });

      const whereArg = (
        mockPrisma.staffCompensation.findMany.mock.calls[0][0] as {
          where: Record<string, unknown>;
        }
      ).where;
      expect(whereArg).not.toHaveProperty('effective_to');
    });
  });

  // ─── getActiveCompensation ───────────────────────────────────────────────

  describe('getActiveCompensation', () => {
    it('should return serialized active compensation', async () => {
      mockPrisma.staffCompensation.findFirst.mockResolvedValue({
        id: COMP_ID,
        base_salary: '5000.00',
        per_class_rate: null,
        bonus_class_rate: null,
        bonus_day_multiplier: '1.50',
      });

      const result = (await service.getActiveCompensation(TENANT_ID, STAFF_PROFILE_ID)) as Record<
        string,
        unknown
      >;

      expect(result).not.toBeNull();
      expect(result['base_salary']).toBe(5000);
    });

    it('should return null when no active compensation exists', async () => {
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);

      const result = await service.getActiveCompensation(TENANT_ID, STAFF_PROFILE_ID);
      expect(result).toBeNull();
    });
  });

  // ─── bulkImport ──────────────────────────────────────────────────────────

  describe('bulkImport', () => {
    it('should throw BadRequestException for empty CSV', async () => {
      const csvBuffer = Buffer.from('');

      await expect(service.bulkImport(TENANT_ID, USER_ID, csvBuffer)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.bulkImport(TENANT_ID, USER_ID, csvBuffer)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EMPTY_CSV' }),
      });
    });

    it('should throw BadRequestException for CSV with only header', async () => {
      const csvBuffer = Buffer.from('staff_number,compensation_type,effective_from\n');

      await expect(service.bulkImport(TENANT_ID, USER_ID, csvBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for missing required header', async () => {
      const csvBuffer = Buffer.from('name,compensation_type\nJohn,salaried\n');

      await expect(service.bulkImport(TENANT_ID, USER_ID, csvBuffer)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.bulkImport(TENANT_ID, USER_ID, csvBuffer)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MISSING_CSV_HEADER' }),
      });
    });

    it('should report errors for staff not found', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,base_salary\nSTF-999,salaried,2026-03-01,5000\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not found');
    });

    it('should report errors for invalid compensation_type', async () => {
      const csv = 'staff_number,compensation_type,effective_from\nSTF-001,hourly,2026-03-01\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid compensation_type');
    });

    it('should report errors for invalid effective_from date', async () => {
      const csv = 'staff_number,compensation_type,effective_from\nSTF-001,salaried,not-a-date\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid effective_from');
    });

    it('should import valid rows and close existing active compensation', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,base_salary\nSTF-001,salaried,2026-03-01,6000\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });

      const existingComp = {
        id: '55555555-5555-5555-5555-555555555555',
        effective_from: new Date('2026-01-01'),
        effective_to: null,
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existingComp);
      mockPrisma.staffCompensation.update.mockResolvedValue({});
      mockPrisma.staffCompensation.create.mockResolvedValue({ id: COMP_ID });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.staffCompensation.update).toHaveBeenCalled();
    });

    it('should not close existing active if closing date before effective_from', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,base_salary\nSTF-001,salaried,2026-03-01,6000\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });

      const existingComp = {
        id: '55555555-5555-5555-5555-555555555555',
        effective_from: new Date('2026-03-01'), // same day = closing date would be Feb 28 which is < Mar 1
        effective_to: null,
      };
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(existingComp);
      mockPrisma.staffCompensation.create.mockResolvedValue({ id: COMP_ID });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(1);
      // Should NOT have updated the existing compensation (closing date < existing start)
      expect(mockPrisma.staffCompensation.update).not.toHaveBeenCalled();
    });

    it('should handle import without existing active compensation', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,base_salary\nSTF-001,salaried,2026-03-01,5000\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);
      mockPrisma.staffCompensation.create.mockResolvedValue({ id: COMP_ID });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse optional fields (per_class_rate, bonus fields, etc.)', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,per_class_rate,assigned_class_count,bonus_class_rate,bonus_day_multiplier\nSTF-001,per_class,2026-03-01,200,20,250,1.5\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);
      mockPrisma.staffCompensation.create.mockResolvedValue({ id: COMP_ID });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(1);
      expect(mockPrisma.staffCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            compensation_type: 'per_class',
            per_class_rate: 200,
            assigned_class_count: 20,
            bonus_class_rate: 250,
            bonus_day_multiplier: 1.5,
          }),
        }),
      );
    });

    it('should default bonus_day_multiplier to 1.0 when empty', async () => {
      const csv =
        'staff_number,compensation_type,effective_from,base_salary,bonus_day_multiplier\nSTF-001,salaried,2026-03-01,5000,\n';
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        tenant_id: TENANT_ID,
        staff_number: 'STF-001',
      });
      mockPrisma.staffCompensation.findFirst.mockResolvedValue(null);
      mockPrisma.staffCompensation.create.mockResolvedValue({ id: COMP_ID });

      const result = await service.bulkImport(TENANT_ID, USER_ID, Buffer.from(csv));

      expect(result.imported).toBe(1);
      expect(mockPrisma.staffCompensation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bonus_day_multiplier: 1.0,
          }),
        }),
      );
    });
  });
});
