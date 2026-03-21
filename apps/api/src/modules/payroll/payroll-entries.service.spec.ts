import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CalculationService } from './calculation.service';
import { PayrollEntriesService } from './payroll-entries.service';

describe('PayrollEntriesService', () => {
  let service: PayrollEntriesService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const ENTRY_ID = '22222222-2222-2222-2222-222222222222';
  const RUN_ID = '33333333-3333-3333-3333-333333333333';

  const NOW = new Date('2026-03-15T10:00:00.000Z');

  const mockPrisma = {
    payrollEntry: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCalculationService = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PayrollEntriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CalculationService, useValue: mockCalculationService },
      ],
    }).compile();

    service = module.get<PayrollEntriesService>(PayrollEntriesService);
  });

  const makeSalariedEntry = (overrides?: Record<string, unknown>) => ({
    id: ENTRY_ID,
    tenant_id: TENANT_ID,
    payroll_run_id: RUN_ID,
    staff_profile_id: '44444444-4444-4444-4444-444444444444',
    compensation_type: 'salaried',
    snapshot_base_salary: 5000,
    snapshot_per_class_rate: null,
    snapshot_assigned_class_count: null,
    snapshot_bonus_class_rate: null,
    snapshot_bonus_day_multiplier: 1.0,
    days_worked: 22,
    classes_taught: null,
    basic_pay: 5000,
    bonus_pay: 0,
    total_pay: 5000,
    notes: null,
    updated_at: NOW,
    payroll_run: { id: RUN_ID, status: 'draft', total_working_days: 22 },
    ...overrides,
  });

  const makePerClassEntry = (overrides?: Record<string, unknown>) => ({
    id: ENTRY_ID,
    tenant_id: TENANT_ID,
    payroll_run_id: RUN_ID,
    staff_profile_id: '44444444-4444-4444-4444-444444444444',
    compensation_type: 'per_class',
    snapshot_base_salary: null,
    snapshot_per_class_rate: 200,
    snapshot_assigned_class_count: 20,
    snapshot_bonus_class_rate: 250,
    snapshot_bonus_day_multiplier: null,
    days_worked: null,
    classes_taught: 18,
    basic_pay: 3600,
    bonus_pay: 0,
    total_pay: 3600,
    notes: null,
    updated_at: NOW,
    payroll_run: { id: RUN_ID, status: 'draft', total_working_days: 22 },
    ...overrides,
  });

  describe('updateEntry', () => {
    it('should update entry and recalculate for salaried', async () => {
      const entry = makeSalariedEntry();
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 4545.45,
        bonus_pay: 0,
        total_pay: 4545.45,
      });

      const updatedRecord = {
        ...entry,
        days_worked: 20,
        basic_pay: 4545.45,
        bonus_pay: 0,
        total_pay: 4545.45,
        staff_profile: {
          id: entry.staff_profile_id,
          staff_number: 'STF-001',
          user: { id: 'u1', first_name: 'Ali', last_name: 'Khan' },
        },
      };
      mockPrisma.payrollEntry.update.mockResolvedValue(updatedRecord);

      const result = await service.updateEntry(TENANT_ID, ENTRY_ID, {
        days_worked: 20,
        expected_updated_at: NOW.toISOString(),
      });

      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          total_working_days: 22,
          days_worked: 20,
        }),
      );

      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledWith({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({
          days_worked: 20,
          basic_pay: 4545.45,
          bonus_pay: 0,
          total_pay: 4545.45,
        }),
        include: expect.any(Object),
      });

      expect(result['basic_pay']).toBe(4545.45);
    });

    it('should update entry and recalculate for per_class', async () => {
      const entry = makePerClassEntry();
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 4000,
        bonus_pay: 500,
        total_pay: 4500,
      });

      const updatedRecord = {
        ...entry,
        classes_taught: 22,
        basic_pay: 4000,
        bonus_pay: 500,
        total_pay: 4500,
        staff_profile: {
          id: entry.staff_profile_id,
          staff_number: 'STF-002',
          user: { id: 'u2', first_name: 'Sara', last_name: 'Ahmed' },
        },
      };
      mockPrisma.payrollEntry.update.mockResolvedValue(updatedRecord);

      const result = await service.updateEntry(TENANT_ID, ENTRY_ID, {
        classes_taught: 22,
        expected_updated_at: NOW.toISOString(),
      });

      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
          snapshot_assigned_class_count: 20,
          snapshot_bonus_class_rate: 250,
          classes_taught: 22,
        }),
      );

      expect(result['bonus_pay']).toBe(500);
      expect(result['total_pay']).toBe(4500);
    });

    it('should reject update on non-draft run', async () => {
      const entry = makeSalariedEntry({
        payroll_run: { id: RUN_ID, status: 'finalised', total_working_days: 22 },
      });
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          days_worked: 20,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          days_worked: 20,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RUN_NOT_DRAFT' }),
      });

      expect(mockPrisma.payrollEntry.update).not.toHaveBeenCalled();
    });

    it('should reject days_worked on per_class entry', async () => {
      const entry = makePerClassEntry();
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          days_worked: 20,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          days_worked: 20,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_FIELD_FOR_TYPE' }),
      });
    });

    it('should reject classes_taught on salaried entry', async () => {
      const entry = makeSalariedEntry();
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          classes_taught: 15,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          classes_taught: 15,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_FIELD_FOR_TYPE' }),
      });
    });

    it('should throw NotFoundException when entry does not exist', async () => {
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEntry(TENANT_ID, 'nonexistent', {
          days_worked: 20,
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on concurrent modification', async () => {
      const entry = makeSalariedEntry();
      mockPrisma.payrollEntry.findFirst.mockResolvedValue(entry);

      await expect(
        service.updateEntry(TENANT_ID, ENTRY_ID, {
          days_worked: 20,
          expected_updated_at: '2026-01-01T00:00:00.000Z', // stale timestamp
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
