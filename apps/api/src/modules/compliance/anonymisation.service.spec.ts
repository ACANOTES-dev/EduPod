import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AnonymisationService } from './anonymisation.service';

// Mock createRlsClient
const mockTx: Record<string, unknown> = {};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

// eslint-disable-next-line import/order -- must come after jest.mock
import { createRlsClient } from '../../common/middleware/rls.middleware';

describe('AnonymisationService', () => {
  let service: AnonymisationService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const PARENT_ID = '22222222-2222-2222-2222-222222222222';
  const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
  const HOUSEHOLD_ID = '44444444-4444-4444-4444-444444444444';
  const STAFF_PROFILE_ID = '55555555-5555-5555-5555-555555555555';
  const USER_ID = '66666666-6666-6666-6666-666666666666';

  const mockPrisma = {};

  const mockParent = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockStudent = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockHousehold = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockStaffProfile = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockPayrollEntry = {
    updateMany: jest.fn(),
  };

  const mockPayslip = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  const mockReportCard = {
    findMany: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Wire mockTx models
    mockTx['parent'] = mockParent;
    mockTx['student'] = mockStudent;
    mockTx['household'] = mockHousehold;
    mockTx['staffProfile'] = mockStaffProfile;
    mockTx['payrollEntry'] = mockPayrollEntry;
    mockTx['payslip'] = mockPayslip;
    mockTx['reportCard'] = mockReportCard;

    const module = await Test.createTestingModule({
      providers: [
        AnonymisationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnonymisationService>(AnonymisationService);
  });

  // ─── anonymiseSubject() dispatch ───────────────────────────────

  describe('anonymiseSubject() dispatch', () => {
    it('should dispatch to anonymiseParent for parent subject within RLS transaction', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'John',
      });
      mockParent.update.mockResolvedValue({});

      const result = await service.anonymiseSubject(TENANT_ID, 'parent', PARENT_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      expect(mockParent.findFirst).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        select: { id: true, first_name: true },
      });
      expect(mockParent.update).toHaveBeenCalled();
      expect(result.anonymised_entities).toEqual(['parent']);
    });

    it('should dispatch to anonymiseStudent for student subject', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
      });
      mockStudent.update.mockResolvedValue({});
      mockReportCard.findMany.mockResolvedValue([]);

      const result = await service.anonymiseSubject(TENANT_ID, 'student', STUDENT_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      expect(mockStudent.findFirst).toHaveBeenCalled();
      expect(result.anonymised_entities).toEqual(['student']);
    });

    it('should dispatch to anonymiseHousehold for household subject', async () => {
      mockHousehold.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'The Smiths',
      });
      mockHousehold.update.mockResolvedValue({});

      const result = await service.anonymiseSubject(TENANT_ID, 'household', HOUSEHOLD_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      expect(mockHousehold.findFirst).toHaveBeenCalled();
      expect(result.anonymised_entities).toEqual(['household']);
    });

    it('should dispatch to anonymiseStaff for user subject with staff profile', async () => {
      mockStaffProfile.findFirst.mockResolvedValueOnce({
        id: STAFF_PROFILE_ID,
      });
      mockStaffProfile.findFirst.mockResolvedValueOnce({
        id: STAFF_PROFILE_ID,
        job_title: 'Teacher',
      });
      mockStaffProfile.update.mockResolvedValue({});
      mockPayrollEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPayslip.findMany.mockResolvedValue([]);

      const result = await service.anonymiseSubject(TENANT_ID, 'user', USER_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      // First call finds the staff profile by user_id
      expect(mockStaffProfile.findFirst).toHaveBeenCalledWith({
        where: { user_id: USER_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
      expect(result.anonymised_entities).toEqual(['staff_profile']);
    });

    it('should skip anonymisation for user with no staff profile', async () => {
      mockStaffProfile.findFirst.mockResolvedValue(null);

      const result = await service.anonymiseSubject(TENANT_ID, 'user', USER_ID);

      expect(result.anonymised_entities).toEqual([]);
    });

    it('should return list of anonymised entity types', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'Jane',
      });
      mockParent.update.mockResolvedValue({});

      const result = await service.anonymiseSubject(TENANT_ID, 'parent', PARENT_ID);

      expect(result).toEqual({ anonymised_entities: ['parent'] });
    });
  });

  // ─── anonymiseParent() ─────────────────────────────────────────

  describe('anonymiseParent()', () => {
    it('should replace first_name, last_name, email, phone with ANONYMISED-{id}', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'John',
      });
      mockParent.update.mockResolvedValue({});

      await service.anonymiseParent(TENANT_ID, PARENT_ID, mockTx as never);

      const anonValue = `ANONYMISED-${PARENT_ID}`;
      expect(mockParent.update).toHaveBeenCalledWith({
        where: { id: PARENT_ID },
        data: {
          first_name: anonValue,
          last_name: anonValue,
          email: `${anonValue}@anonymised.local`,
          phone: anonValue,
          whatsapp_phone: anonValue,
        },
      });
    });

    it('should also anonymise whatsapp_phone', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'John',
      });
      mockParent.update.mockResolvedValue({});

      await service.anonymiseParent(TENANT_ID, PARENT_ID, mockTx as never);

      const updateCall = mockParent.update.mock.calls[0][0];
      expect(updateCall.data.whatsapp_phone).toBe(`ANONYMISED-${PARENT_ID}`);
    });

    it('should be idempotent (skip if first_name starts with ANONYMISED-)', async () => {
      mockParent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: `ANONYMISED-${PARENT_ID}`,
      });

      await service.anonymiseParent(TENANT_ID, PARENT_ID, mockTx as never);

      expect(mockParent.update).not.toHaveBeenCalled();
    });

    it('should handle non-existent parent gracefully (no error)', async () => {
      mockParent.findFirst.mockResolvedValue(null);

      await expect(
        service.anonymiseParent(TENANT_ID, PARENT_ID, mockTx as never),
      ).resolves.toBeUndefined();

      expect(mockParent.update).not.toHaveBeenCalled();
    });
  });

  // ─── anonymiseStudent() ────────────────────────────────────────

  describe('anonymiseStudent()', () => {
    it('should replace first_name, last_name, full_name, student_number', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
      });
      mockStudent.update.mockResolvedValue({});
      mockReportCard.findMany.mockResolvedValue([]);

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STUDENT_ID}`;
      expect(mockStudent.update).toHaveBeenCalledWith({
        where: { id: STUDENT_ID },
        data: expect.objectContaining({
          first_name: anonValue,
          last_name: anonValue,
          student_number: anonValue,
        }),
      });
    });

    it('should anonymise Arabic name fields (first_name_ar, last_name_ar) but not generated full_name_ar', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
      });
      mockStudent.update.mockResolvedValue({});
      mockReportCard.findMany.mockResolvedValue([]);

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STUDENT_ID}`;
      const updateCall = mockStudent.update.mock.calls[0][0];
      expect(updateCall.data.first_name_ar).toBe(anonValue);
      expect(updateCall.data.last_name_ar).toBe(anonValue);
      expect(updateCall.data).not.toHaveProperty('full_name_ar');
    });

    it('should anonymise report card snapshot student_name', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
      });
      mockStudent.update.mockResolvedValue({});
      mockReportCard.findMany.mockResolvedValue([
        {
          id: 'rc-1',
          snapshot_payload_json: {
            student_name: 'Alice Smith',
            grade: 'A',
          },
        },
      ]);
      mockReportCard.update.mockResolvedValue({});

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STUDENT_ID}`;
      expect(mockReportCard.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: {
          snapshot_payload_json: expect.objectContaining({
            student_name: anonValue,
            grade: 'A',
          }),
        },
      });
    });

    it('should anonymise report card snapshot student_first_name and student_last_name', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
      });
      mockStudent.update.mockResolvedValue({});
      mockReportCard.findMany.mockResolvedValue([
        {
          id: 'rc-2',
          snapshot_payload_json: {
            student_first_name: 'Alice',
            student_last_name: 'Smith',
          },
        },
      ]);
      mockReportCard.update.mockResolvedValue({});

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STUDENT_ID}`;
      expect(mockReportCard.update).toHaveBeenCalledWith({
        where: { id: 'rc-2' },
        data: {
          snapshot_payload_json: expect.objectContaining({
            student_first_name: anonValue,
            student_last_name: anonValue,
          }),
        },
      });
    });

    it('should be idempotent', async () => {
      mockStudent.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: `ANONYMISED-${STUDENT_ID}`,
      });

      await service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never);

      expect(mockStudent.update).not.toHaveBeenCalled();
      expect(mockReportCard.findMany).not.toHaveBeenCalled();
    });

    it('should handle non-existent student gracefully', async () => {
      mockStudent.findFirst.mockResolvedValue(null);

      await expect(
        service.anonymiseStudent(TENANT_ID, STUDENT_ID, mockTx as never),
      ).resolves.toBeUndefined();

      expect(mockStudent.update).not.toHaveBeenCalled();
    });
  });

  // ─── anonymiseHousehold() ──────────────────────────────────────

  describe('anonymiseHousehold()', () => {
    it('should replace household_name with ANONYMISED-{id}', async () => {
      mockHousehold.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'The Smiths',
      });
      mockHousehold.update.mockResolvedValue({});

      await service.anonymiseHousehold(TENANT_ID, HOUSEHOLD_ID, mockTx as never);

      expect(mockHousehold.update).toHaveBeenCalledWith({
        where: { id: HOUSEHOLD_ID },
        data: {
          household_name: `ANONYMISED-${HOUSEHOLD_ID}`,
        },
      });
    });

    it('should be idempotent', async () => {
      mockHousehold.findFirst.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: `ANONYMISED-${HOUSEHOLD_ID}`,
      });

      await service.anonymiseHousehold(TENANT_ID, HOUSEHOLD_ID, mockTx as never);

      expect(mockHousehold.update).not.toHaveBeenCalled();
    });

    it('should handle non-existent household gracefully', async () => {
      mockHousehold.findFirst.mockResolvedValue(null);

      await expect(
        service.anonymiseHousehold(TENANT_ID, HOUSEHOLD_ID, mockTx as never),
      ).resolves.toBeUndefined();

      expect(mockHousehold.update).not.toHaveBeenCalled();
    });
  });

  // ─── anonymiseStaff() ──────────────────────────────────────────

  describe('anonymiseStaff()', () => {
    it('should replace job_title and department', async () => {
      mockStaffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        job_title: 'Teacher',
      });
      mockStaffProfile.update.mockResolvedValue({});
      mockPayrollEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPayslip.findMany.mockResolvedValue([]);

      await service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STAFF_PROFILE_ID}`;
      expect(mockStaffProfile.update).toHaveBeenCalledWith({
        where: { id: STAFF_PROFILE_ID },
        data: {
          job_title: anonValue,
          department: anonValue,
        },
      });
    });

    it('should anonymise payroll entry notes via updateMany', async () => {
      mockStaffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        job_title: 'Teacher',
      });
      mockStaffProfile.update.mockResolvedValue({});
      mockPayrollEntry.updateMany.mockResolvedValue({ count: 3 });
      mockPayslip.findMany.mockResolvedValue([]);

      await service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STAFF_PROFILE_ID}`;
      expect(mockPayrollEntry.updateMany).toHaveBeenCalledWith({
        where: { staff_profile_id: STAFF_PROFILE_ID, tenant_id: TENANT_ID },
        data: { notes: anonValue },
      });
    });

    it('should anonymise payslip snapshot staff_name, employee_name, job_title, department', async () => {
      mockStaffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        job_title: 'Teacher',
      });
      mockStaffProfile.update.mockResolvedValue({});
      mockPayrollEntry.updateMany.mockResolvedValue({ count: 0 });
      mockPayslip.findMany.mockResolvedValue([
        {
          id: 'ps-1',
          snapshot_payload_json: {
            staff_name: 'John Doe',
            employee_name: 'John Doe',
            job_title: 'Teacher',
            department: 'Maths',
            base_salary: 5000,
          },
        },
      ]);
      mockPayslip.update.mockResolvedValue({});

      await service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never);

      const anonValue = `ANONYMISED-${STAFF_PROFILE_ID}`;
      expect(mockPayslip.update).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
        data: {
          snapshot_payload_json: expect.objectContaining({
            staff_name: anonValue,
            employee_name: anonValue,
            job_title: anonValue,
            department: anonValue,
            base_salary: 5000,
          }),
        },
      });
    });

    it('should be idempotent (job_title starts with ANONYMISED-)', async () => {
      mockStaffProfile.findFirst.mockResolvedValue({
        id: STAFF_PROFILE_ID,
        job_title: `ANONYMISED-${STAFF_PROFILE_ID}`,
      });

      await service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never);

      expect(mockStaffProfile.update).not.toHaveBeenCalled();
      expect(mockPayrollEntry.updateMany).not.toHaveBeenCalled();
      expect(mockPayslip.findMany).not.toHaveBeenCalled();
    });

    it('should handle non-existent staff profile gracefully', async () => {
      mockStaffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.anonymiseStaff(TENANT_ID, STAFF_PROFILE_ID, mockTx as never),
      ).resolves.toBeUndefined();

      expect(mockStaffProfile.update).not.toHaveBeenCalled();
    });
  });
});
