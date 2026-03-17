import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { PayslipsService } from './payslips.service';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../configuration/encryption.service';

describe('PayslipsService', () => {
  let service: PayslipsService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const PAYSLIP_ID = '33333333-3333-3333-3333-333333333333';
  const RUN_ID = '44444444-4444-4444-4444-444444444444';

  const mockPrisma = {
    payslip: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    payrollRun: {
      findFirst: jest.fn(),
    },
    tenantBranding: {
      findUnique: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  };

  const mockPdfRenderingService = {
    renderPdf: jest.fn(),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  const mockEncryptionService = {
    decrypt: jest.fn(),
  };

  const mockPayrollQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PayslipsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: getQueueToken('payroll'), useValue: mockPayrollQueue },
      ],
    }).compile();

    service = module.get<PayslipsService>(PayslipsService);
  });

  describe('renderPayslipPdf', () => {
    it('should render individual payslip PDF', async () => {
      const snapshotPayload = {
        staff: {
          full_name: 'Ali Khan',
          staff_number: 'STF-001',
          department: 'Math',
          job_title: 'Teacher',
          employment_type: 'full_time',
          bank_name: 'Al Rajhi',
          bank_account_last4: '4821',
          bank_iban_last4: '9012',
        },
        period: {
          label: 'March 2026',
          month: 3,
          year: 2026,
          total_working_days: 22,
        },
        compensation: {
          type: 'salaried',
          base_salary: 5000,
          per_class_rate: null,
          assigned_class_count: null,
          bonus_class_rate: null,
          bonus_day_multiplier: 1.5,
        },
        inputs: {
          days_worked: 22,
          classes_taught: null,
        },
        calculations: {
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
        },
        school: {
          name: 'Al Noor School',
          name_ar: null,
          logo_url: 'https://example.com/logo.png',
          currency_code: 'SAR',
        },
      };

      mockPrisma.payslip.findFirst.mockResolvedValue({
        id: PAYSLIP_ID,
        tenant_id: TENANT_ID,
        payslip_number: 'PSL-202603-000001',
        template_locale: 'en',
        snapshot_payload_json: snapshotPayload,
        render_version: '1.0.0',
      });

      const pdfBuffer = Buffer.from('fake-pdf-content');
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.renderPayslipPdf(TENANT_ID, PAYSLIP_ID);

      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'payslip',
        'en', // template_locale from the payslip record
        snapshotPayload,
        {
          school_name: 'Al Noor School',
          school_name_ar: undefined, // null mapped to undefined
          logo_url: 'https://example.com/logo.png',
        },
      );

      expect(result).toBe(pdfBuffer);
    });

    it('should use provided locale override for rendering', async () => {
      const snapshotPayload = {
        staff: { full_name: 'Ali Khan', staff_number: 'STF-001', department: 'Math', job_title: 'Teacher', employment_type: 'full_time', bank_name: null, bank_account_last4: null, bank_iban_last4: null },
        period: { label: 'March 2026', month: 3, year: 2026, total_working_days: 22 },
        compensation: { type: 'salaried', base_salary: 5000, per_class_rate: null, assigned_class_count: null, bonus_class_rate: null, bonus_day_multiplier: 1.0 },
        inputs: { days_worked: 22, classes_taught: null },
        calculations: { basic_pay: 5000, bonus_pay: 0, total_pay: 5000 },
        school: { name: 'Al Noor School', name_ar: 'مدرسة النور', logo_url: null, currency_code: 'SAR' },
      };

      mockPrisma.payslip.findFirst.mockResolvedValue({
        id: PAYSLIP_ID,
        tenant_id: TENANT_ID,
        template_locale: 'en',
        snapshot_payload_json: snapshotPayload,
      });

      mockPdfRenderingService.renderPdf.mockResolvedValue(Buffer.from('pdf'));

      await service.renderPayslipPdf(TENANT_ID, PAYSLIP_ID, 'ar');

      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'payslip',
        'ar', // locale override
        snapshotPayload,
        expect.objectContaining({
          school_name: 'Al Noor School',
          school_name_ar: 'مدرسة النور',
        }),
      );
    });

    it('should throw NotFoundException when payslip not found', async () => {
      mockPrisma.payslip.findFirst.mockResolvedValue(null);

      await expect(
        service.renderPayslipPdf(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('generatePayslipsForRun', () => {
    it('should handle missing bank details gracefully in snapshot', async () => {
      const mockDb = {
        payrollRun: {
          findFirst: jest.fn().mockResolvedValue({
            id: RUN_ID,
            tenant_id: TENANT_ID,
            period_label: 'March 2026',
            period_month: 3,
            period_year: 2026,
            total_working_days: 22,
            entries: [
              {
                id: 'entry-1',
                staff_profile_id: 'sp-1',
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
                staff_profile: {
                  id: 'sp-1',
                  staff_number: 'STF-001',
                  department: 'Math',
                  job_title: 'Teacher',
                  employment_type: 'full_time',
                  bank_name: null,
                  bank_account_number_encrypted: null,
                  bank_iban_encrypted: null,
                  bank_encryption_key_ref: null,
                  user: { first_name: 'Ali', last_name: 'Khan' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest.fn().mockResolvedValue({
            school_name_display: 'Al Noor School',
            school_name_ar: null,
            logo_url: null,
            payslip_prefix: 'PSL',
          }),
        },
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: TENANT_ID,
            name: 'Al Noor School',
            currency_code: 'SAR',
          }),
        },
        payslip: {
          create: jest.fn().mockResolvedValue({
            id: PAYSLIP_ID,
            payslip_number: 'PSL-202603-000001',
          }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const payslips = await service.generatePayslipsForRun(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        mockDb,
      );

      expect(payslips).toHaveLength(1);

      // Verify the payslip was created with null bank details in the snapshot
      const createCall = mockDb.payslip.create.mock.calls[0][0] as {
        data: { snapshot_payload_json: { staff: { bank_account_last4: string | null; bank_iban_last4: string | null } } };
      };
      const snapshot = createCall.data.snapshot_payload_json;
      expect(snapshot.staff.bank_account_last4).toBeNull();
      expect(snapshot.staff.bank_iban_last4).toBeNull();

      // Encryption service should NOT have been called (no encrypted data)
      expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
    });

    it('should decrypt bank details and include last 4 chars', async () => {
      const mockDb = {
        payrollRun: {
          findFirst: jest.fn().mockResolvedValue({
            id: RUN_ID,
            tenant_id: TENANT_ID,
            period_label: 'March 2026',
            period_month: 3,
            period_year: 2026,
            total_working_days: 22,
            entries: [
              {
                id: 'entry-1',
                staff_profile_id: 'sp-1',
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
                staff_profile: {
                  id: 'sp-1',
                  staff_number: 'STF-001',
                  department: 'Math',
                  job_title: 'Teacher',
                  employment_type: 'full_time',
                  bank_name: 'Al Rajhi',
                  bank_account_number_encrypted: 'encrypted-account',
                  bank_iban_encrypted: 'encrypted-iban',
                  bank_encryption_key_ref: 'arn:aws:secretsmanager:key-ref',
                  user: { first_name: 'Ali', last_name: 'Khan' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest.fn().mockResolvedValue({
            school_name_display: 'Al Noor School',
            school_name_ar: null,
            logo_url: null,
            payslip_prefix: 'PSL',
          }),
        },
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: TENANT_ID,
            name: 'Al Noor School',
            currency_code: 'SAR',
          }),
        },
        payslip: {
          create: jest.fn().mockResolvedValue({
            id: PAYSLIP_ID,
            payslip_number: 'PSL-202603-000001',
          }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      // Decrypt returns full values; service should take last 4
      mockEncryptionService.decrypt
        .mockReturnValueOnce('1234567890124821') // account number
        .mockReturnValueOnce('SA1234567890129012'); // IBAN

      const payslips = await service.generatePayslipsForRun(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        mockDb,
      );

      expect(payslips).toHaveLength(1);

      const createCall = mockDb.payslip.create.mock.calls[0][0] as {
        data: { snapshot_payload_json: { staff: { bank_account_last4: string | null; bank_iban_last4: string | null } } };
      };
      const snapshot = createCall.data.snapshot_payload_json;
      expect(snapshot.staff.bank_account_last4).toBe('4821');
      expect(snapshot.staff.bank_iban_last4).toBe('9012');

      expect(mockEncryptionService.decrypt).toHaveBeenCalledTimes(2);
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(
        'encrypted-account',
        'arn:aws:secretsmanager:key-ref',
      );
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(
        'encrypted-iban',
        'arn:aws:secretsmanager:key-ref',
      );
    });
  });

  describe('getPayslip', () => {
    it('should throw NotFoundException when payslip not found', async () => {
      mockPrisma.payslip.findFirst.mockResolvedValue(null);

      await expect(
        service.getPayslip(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
