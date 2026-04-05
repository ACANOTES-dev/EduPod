import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { EncryptionService } from '../configuration/encryption.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { PayslipsService } from './payslips.service';

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
        staff: {
          full_name: 'Ali Khan',
          staff_number: 'STF-001',
          department: 'Math',
          job_title: 'Teacher',
          employment_type: 'full_time',
          bank_name: null,
          bank_account_last4: null,
          bank_iban_last4: null,
        },
        period: { label: 'March 2026', month: 3, year: 2026, total_working_days: 22 },
        compensation: {
          type: 'salaried',
          base_salary: 5000,
          per_class_rate: null,
          assigned_class_count: null,
          bonus_class_rate: null,
          bonus_day_multiplier: 1.0,
        },
        inputs: { days_worked: 22, classes_taught: null },
        calculations: { basic_pay: 5000, bonus_pay: 0, total_pay: 5000 },
        school: {
          name: 'Al Noor School',
          name_ar: 'مدرسة النور',
          logo_url: null,
          currency_code: 'SAR',
        },
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

      await expect(service.renderPayslipPdf(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
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

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);

      // Verify the payslip was created with null bank details in the snapshot
      const createCall = mockDb.payslip.create.mock.calls[0][0] as {
        data: {
          snapshot_payload_json: {
            staff: { bank_account_last4: string | null; bank_iban_last4: string | null };
          };
        };
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

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);

      const createCall = mockDb.payslip.create.mock.calls[0][0] as {
        data: {
          snapshot_payload_json: {
            staff: { bank_account_last4: string | null; bank_iban_last4: string | null };
          };
        };
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

      await expect(service.getPayslip(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return serialized payslip with numeric decimal fields', async () => {
      mockPrisma.payslip.findFirst.mockResolvedValue({
        id: PAYSLIP_ID,
        tenant_id: TENANT_ID,
        payslip_number: 'PSL-202603-000001',
        payroll_entry: {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          staff_profile_id: 'sp-1',
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          staff_profile: {
            id: 'sp-1',
            staff_number: 'STF-001',
            user: { first_name: 'Ali', last_name: 'Khan' },
          },
        },
      });

      const result = await service.getPayslip(TENANT_ID, PAYSLIP_ID);

      expect(result).toHaveProperty('id', PAYSLIP_ID);
      const entry = (result as Record<string, unknown>)['payroll_entry'] as Record<string, unknown>;
      expect(entry['basic_pay']).toBe(5000);
      expect(entry['bonus_pay']).toBe(200);
      expect(entry['total_pay']).toBe(5200);
    });
  });

  describe('listPayslips', () => {
    it('should filter by payroll_run_id when provided', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([]);
      mockPrisma.payslip.count.mockResolvedValue(0);

      await service.listPayslips(TENANT_ID, {
        page: 1,
        pageSize: 20,
        payroll_run_id: RUN_ID,
      });

      expect(mockPrisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            payroll_entry: { payroll_run_id: RUN_ID },
          }),
        }),
      );
    });

    it('should filter by staff_profile_id when provided', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([]);
      mockPrisma.payslip.count.mockResolvedValue(0);

      await service.listPayslips(TENANT_ID, {
        page: 1,
        pageSize: 20,
        staff_profile_id: 'sp-1',
      });

      expect(mockPrisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payroll_entry: { staff_profile_id: 'sp-1' },
          }),
        }),
      );
    });

    it('should combine both filters when payroll_run_id and staff_profile_id provided', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([]);
      mockPrisma.payslip.count.mockResolvedValue(0);

      await service.listPayslips(TENANT_ID, {
        page: 1,
        pageSize: 20,
        payroll_run_id: RUN_ID,
        staff_profile_id: 'sp-1',
      });

      expect(mockPrisma.payslip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payroll_entry: {
              payroll_run_id: RUN_ID,
              staff_profile_id: 'sp-1',
            },
          }),
        }),
      );
    });

    it('should serialize payslip entries with numeric fields', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([
        {
          id: PAYSLIP_ID,
          tenant_id: TENANT_ID,
          payroll_entry: {
            id: 'entry-1',
            basic_pay: 5000,
            bonus_pay: 0,
            total_pay: 5000,
          },
        },
      ]);
      mockPrisma.payslip.count.mockResolvedValue(1);

      const result = await service.listPayslips(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      const entry = (result.data[0] as Record<string, unknown>)['payroll_entry'] as Record<
        string,
        unknown
      >;
      expect(typeof entry['basic_pay']).toBe('number');
    });

    it('should handle payslip without payroll_entry in serialization', async () => {
      mockPrisma.payslip.findMany.mockResolvedValue([
        {
          id: PAYSLIP_ID,
          tenant_id: TENANT_ID,
        },
      ]);
      mockPrisma.payslip.count.mockResolvedValue(1);

      const result = await service.listPayslips(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>)['payroll_entry']).toBeUndefined();
    });
  });

  describe('generatePayslipsForRun — error branches', () => {
    it('should throw NotFoundException when run not found', async () => {
      const mockDb = {
        payrollRun: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      await expect(
        service.generatePayslipsForRun(TENANT_ID, 'nonexistent', USER_ID, mockDb),
      ).rejects.toThrow(NotFoundException);
    });

    it('edge: should handle decrypt failure for bank account gracefully', async () => {
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
                snapshot_bonus_day_multiplier: null,
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
                  bank_encryption_key_ref: 'key-ref',
                  user: { first_name: 'Ali', last_name: 'Khan' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        tenant: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: TENANT_ID, name: 'Test School', currency_code: 'SAR' }),
        },
        payslip: {
          create: jest.fn().mockResolvedValue({ id: PAYSLIP_ID }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      // Both decrypt calls fail
      mockEncryptionService.decrypt
        .mockImplementationOnce(() => {
          throw new Error('decrypt failed');
        })
        .mockImplementationOnce(() => {
          throw new Error('decrypt failed');
        });

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);

      const createCall = mockDb.payslip.create.mock.calls[0]![0] as {
        data: {
          snapshot_payload_json: {
            staff: { bank_account_last4: string | null; bank_iban_last4: string | null };
          };
        };
      };
      const snapshot = createCall.data.snapshot_payload_json;
      expect(snapshot.staff.bank_account_last4).toBeNull();
      expect(snapshot.staff.bank_iban_last4).toBeNull();
    });

    it('edge: should use full string when bank account is <= 4 chars', async () => {
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
                snapshot_bonus_day_multiplier: null,
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
                  bank_account_number_encrypted: 'encrypted-short',
                  bank_iban_encrypted: 'encrypted-short-iban',
                  bank_encryption_key_ref: 'key-ref',
                  user: { first_name: 'Ali', last_name: 'Khan' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest
            .fn()
            .mockResolvedValue({
              payslip_prefix: 'PAY',
              school_name_display: 'Test',
              school_name_ar: null,
              logo_url: null,
            }),
        },
        tenant: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: TENANT_ID, name: 'Test', currency_code: 'SAR' }),
        },
        payslip: {
          create: jest.fn().mockResolvedValue({ id: PAYSLIP_ID }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(0) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      // Short bank details (<=4 chars)
      mockEncryptionService.decrypt.mockReturnValueOnce('1234').mockReturnValueOnce('AB12');

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);
      const createCall = mockDb.payslip.create.mock.calls[0]![0] as {
        data: {
          snapshot_payload_json: {
            staff: { bank_account_last4: string | null; bank_iban_last4: string | null };
          };
        };
      };
      expect(createCall.data.snapshot_payload_json.staff.bank_account_last4).toBe('1234');
      expect(createCall.data.snapshot_payload_json.staff.bank_iban_last4).toBe('AB12');
    });

    it('should include non-null per_class snapshot fields in payslip', async () => {
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
                compensation_type: 'per_class',
                snapshot_base_salary: null,
                snapshot_per_class_rate: 200,
                snapshot_assigned_class_count: 10,
                snapshot_bonus_class_rate: 50,
                snapshot_bonus_day_multiplier: 1.5,
                days_worked: null,
                classes_taught: 12,
                basic_pay: 2400,
                bonus_pay: 600,
                total_pay: 3000,
                staff_profile: {
                  id: 'sp-1',
                  staff_number: 'STF-002',
                  department: 'Science',
                  job_title: 'Lab Tech',
                  employment_type: 'part_time',
                  bank_name: null,
                  bank_account_number_encrypted: null,
                  bank_iban_encrypted: null,
                  bank_encryption_key_ref: null,
                  user: { first_name: 'Bob', last_name: 'Smith' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest.fn().mockResolvedValue({
            school_name_display: 'Test School',
            school_name_ar: 'مدرسة اختبار',
            logo_url: 'https://example.com/logo.png',
            payslip_prefix: 'PAY',
          }),
        },
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: TENANT_ID,
            name: 'Test School',
            currency_code: 'USD',
          }),
        },
        payslip: {
          create: jest.fn().mockResolvedValue({ id: PAYSLIP_ID }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(5) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);
      const createCall = mockDb.payslip.create.mock.calls[0]![0] as {
        data: {
          payslip_number: string;
          snapshot_payload_json: {
            compensation: {
              base_salary: number | null;
              per_class_rate: number | null;
              bonus_class_rate: number | null;
              bonus_day_multiplier: number | null;
            };
            school: { name: string; name_ar: string | null; currency_code: string };
          };
        };
      };
      const comp = createCall.data.snapshot_payload_json.compensation;
      expect(comp.base_salary).toBeNull();
      expect(comp.per_class_rate).toBe(200);
      expect(comp.bonus_class_rate).toBe(50);
      expect(comp.bonus_day_multiplier).toBe(1.5);

      const school = createCall.data.snapshot_payload_json.school;
      expect(school.name).toBe('Test School');
      expect(school.name_ar).toBe('مدرسة اختبار');
      expect(school.currency_code).toBe('USD');

      // Payslip number should use PAY prefix and sequence 6
      expect(createCall.data.payslip_number).toBe('PAY-202603-000006');
    });

    it('should use default prefix when branding has no payslip_prefix', async () => {
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
                snapshot_bonus_day_multiplier: null,
                days_worked: 22,
                classes_taught: null,
                basic_pay: 5000,
                bonus_pay: 0,
                total_pay: 5000,
                staff_profile: {
                  id: 'sp-1',
                  staff_number: 'STF-001',
                  department: null,
                  job_title: null,
                  employment_type: 'full_time',
                  bank_name: null,
                  bank_account_number_encrypted: null,
                  bank_iban_encrypted: null,
                  bank_encryption_key_ref: null,
                  user: { first_name: 'Test', last_name: 'User' },
                },
              },
            ],
          }),
        },
        tenantBranding: {
          findUnique: jest.fn().mockResolvedValue(null), // no branding at all
        },
        tenant: {
          findUnique: jest.fn().mockResolvedValue(null), // no tenant either
        },
        payslip: {
          create: jest.fn().mockResolvedValue({ id: PAYSLIP_ID }),
        },
        $queryRaw: jest.fn().mockResolvedValue([]), // no sequence rows
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const payslips = await service.generatePayslipsForRun(TENANT_ID, RUN_ID, USER_ID, mockDb);

      expect(payslips).toHaveLength(1);
      const createCall = mockDb.payslip.create.mock.calls[0]![0] as {
        data: {
          payslip_number: string;
          snapshot_payload_json: { school: { name: string; currency_code: string } };
        };
      };
      // Default prefix PSL when no branding
      expect(createCall.data.payslip_number).toMatch(/^PSL-/);
      // Fallback school name and currency
      expect(createCall.data.snapshot_payload_json.school.name).toBe('School');
      expect(createCall.data.snapshot_payload_json.school.currency_code).toBe('SAR');
    });
  });

  describe('triggerMassExport', () => {
    it('should queue mass export job and set Redis status', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPayrollQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.triggerMassExport(TENANT_ID, RUN_ID, 'en', USER_ID);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `payroll:mass-export:${TENANT_ID}:${RUN_ID}`,
        expect.stringContaining('"status":"queued"'),
        'EX',
        3600,
      );

      expect(mockPayrollQueue.add).toHaveBeenCalledWith('payroll:mass-export', {
        tenant_id: TENANT_ID,
        run_id: RUN_ID,
        locale: 'en',
        user_id: USER_ID,
      });

      expect(result).toEqual({ status: 'queued', run_id: RUN_ID });
    });
  });

  describe('getMassExportStatus', () => {
    it('should return parsed status when data exists in Redis', async () => {
      const statusData = { status: 'completed', url: 'https://example.com/export.zip' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(statusData));

      const result = await service.getMassExportStatus(TENANT_ID, RUN_ID);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `payroll:mass-export:${TENANT_ID}:${RUN_ID}`,
      );
      expect(result).toEqual(statusData);
    });

    it('should return not_found when no Redis data exists', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getMassExportStatus(TENANT_ID, RUN_ID);

      expect(result).toEqual({ status: 'not_found' });
    });
  });
});
