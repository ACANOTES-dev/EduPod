/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../../common/middleware/rls.middleware');

import {
  MOCK_FACADE_PROVIDERS,
  GdprReadFacade,
  AttendanceReadFacade,
  AuditLogReadFacade,
} from '../../common/tests/mock-facades';
import { createRlsClient } from '../../common/middleware/rls.middleware';

import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { RetentionPoliciesService } from './retention-policies.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '99999999-9999-9999-9999-999999999999';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const POLICY_ID = '33333333-3333-3333-3333-333333333333';
const OVERRIDE_ID = '44444444-4444-4444-4444-444444444444';
const HOLD_ID = '55555555-5555-5555-5555-555555555555';
const SUBJECT_ID = '66666666-6666-6666-6666-666666666666';

const makePlatformDefault = (
  category: string,
  retentionMonths: number,
  overrides?: Partial<{
    id: string;
    is_overridable: boolean;
    action_on_expiry: string;
    statutory_basis: string | null;
  }>,
) => ({
  id: overrides?.id ?? POLICY_ID,
  tenant_id: null,
  data_category: category,
  retention_months: retentionMonths,
  action_on_expiry: overrides?.action_on_expiry ?? 'anonymise',
  is_overridable: overrides?.is_overridable ?? true,
  statutory_basis: overrides?.statutory_basis ?? 'GDPR Article 5(1)(e)',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
});

const makeTenantOverride = (
  category: string,
  retentionMonths: number,
  overrides?: Partial<{ id: string }>,
) => ({
  id: overrides?.id ?? OVERRIDE_ID,
  tenant_id: TENANT_ID,
  data_category: category,
  retention_months: retentionMonths,
  action_on_expiry: 'anonymise',
  is_overridable: true,
  statutory_basis: 'GDPR Article 5(1)(e)',
  created_at: new Date('2026-01-15'),
  updated_at: new Date('2026-01-15'),
});

// ─── Mock Builders ──────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  retentionPolicy: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  retentionHold: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  student: { count: jest.fn() },
  application: { count: jest.fn() },
  payrollRun: { count: jest.fn() },
  staffProfile: { count: jest.fn() },
  attendanceRecord: { count: jest.fn() },
  notification: { count: jest.fn() },
  auditLog: { count: jest.fn() },
  contactFormSubmission: { count: jest.fn() },
  parentInquiryMessage: { count: jest.fn() },
  nlQueryHistory: { count: jest.fn() },
  gdprTokenUsageLog: { count: jest.fn() },
  complianceRequest: { count: jest.fn() },
});

const buildMockFinanceFacade = () => ({
  countInvoicesBeforeDate: jest.fn(),
});

const buildMockBehaviourFacade = () => ({
  countIncidentsBeforeDate: jest.fn(),
});

// ─── RLS Mock Setup ─────────────────────────────────────────────────────────

const mockTx = buildMockPrisma();
const mockRlsTransaction = jest.fn().mockImplementation(async (fn) => fn(mockTx));
(createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockRlsTransaction });

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('RetentionPoliciesService', () => {
  let service: RetentionPoliciesService;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let financeFacade: ReturnType<typeof buildMockFinanceFacade>;
  let behaviourFacade: ReturnType<typeof buildMockBehaviourFacade>;
  let gdprFacade: {
    findRetentionHoldById: jest.Mock;
    findRetentionHolds: jest.Mock;
    findActiveRetentionHoldBySubject: jest.Mock;
    findRetentionPolicyById: jest.Mock;
    findPlatformDefaultPolicies: jest.Mock;
    findTenantPolicyOverrides: jest.Mock;
    findDefaultPolicyByCategory: jest.Mock;
    countTokenUsageLogsBeforeDate: jest.Mock;
  };
  let attendanceFacade: { countAttendanceRecords: jest.Mock };
  let auditLogFacade: { count: jest.Mock };

  beforeEach(async () => {
    prisma = buildMockPrisma();
    financeFacade = buildMockFinanceFacade();
    behaviourFacade = buildMockBehaviourFacade();
    gdprFacade = {
      findRetentionHoldById: jest.fn().mockResolvedValue(null),
      findRetentionHolds: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findActiveRetentionHoldBySubject: jest.fn().mockResolvedValue(null),
      findRetentionPolicyById: jest.fn().mockResolvedValue(null),
      findPlatformDefaultPolicies: jest.fn().mockResolvedValue([]),
      findTenantPolicyOverrides: jest.fn().mockResolvedValue([]),
      findDefaultPolicyByCategory: jest.fn().mockResolvedValue(null),
      countTokenUsageLogsBeforeDate: jest.fn().mockResolvedValue(0),
    };

    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        RetentionPoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FinanceReadFacade, useValue: financeFacade },
        { provide: BehaviourReadFacade, useValue: behaviourFacade },
        { provide: GdprReadFacade, useValue: gdprFacade },
        {
          provide: AttendanceReadFacade,
          useValue: (attendanceFacade = { countAttendanceRecords: jest.fn().mockResolvedValue(0) }),
        },
        {
          provide: AuditLogReadFacade,
          useValue: (auditLogFacade = { count: jest.fn().mockResolvedValue(0) }),
        },
      ],
    }).compile();

    service = module.get<RetentionPoliciesService>(RetentionPoliciesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getEffectivePolicies ───────────────────────────────────────────────

  describe('getEffectivePolicies', () => {
    it('should return merged policies with tenant overrides taking precedence', async () => {
      const defaultA = makePlatformDefault('attendance_records', 24);
      const defaultB = makePlatformDefault('audit_logs', 84, {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      });
      const overrideA = makeTenantOverride('attendance_records', 36);

      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue([defaultA, defaultB]);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([overrideA]);

      const result = await service.getEffectivePolicies(TENANT_ID);

      expect(result.data).toHaveLength(2);

      // attendance_records should use tenant override
      const attendance = result.data.find((p) => p.data_category === 'attendance_records');
      expect(attendance).toBeDefined();
      expect(attendance!.retention_months).toBe(36);
      expect(attendance!.is_override).toBe(true);
      expect(attendance!.default_retention_months).toBe(24);
      expect(attendance!.tenant_id).toBe(TENANT_ID);

      // audit_logs should use platform default
      const auditLogs = result.data.find((p) => p.data_category === 'audit_logs');
      expect(auditLogs).toBeDefined();
      expect(auditLogs!.retention_months).toBe(84);
      expect(auditLogs!.is_override).toBe(false);
      expect(auditLogs!.default_retention_months).toBe(84);
      expect(auditLogs!.tenant_id).toBeNull();
    });

    it('should NOT leak Tenant A overrides into Tenant B results (RLS cross-tenant isolation)', async () => {
      // Tenant A has a custom override for attendance_records (36 months)
      // When we call getEffectivePolicies for Tenant B, it must never surface that override

      const defaultA = makePlatformDefault('attendance_records', 24);
      const defaultB = makePlatformDefault('audit_logs', 84, {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      });

      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue([defaultA, defaultB]);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);

      const result = await service.getEffectivePolicies(TENANT_B_ID);

      // Every returned policy must be a platform default — no overrides for Tenant B
      expect(result.data.every((p) => p.is_override === false)).toBe(true);

      // Confirm the tenant override query was scoped exclusively to Tenant B
      expect(gdprFacade.findTenantPolicyOverrides).toHaveBeenCalledWith(TENANT_B_ID);
    });
  });

  // ─── overridePolicy ───────────────────────────────────────────────────────

  describe('overridePolicy', () => {
    it('should create a tenant override when extending retention', async () => {
      const defaultPolicy = makePlatformDefault('attendance_records', 24);
      gdprFacade.findRetentionPolicyById.mockResolvedValue(defaultPolicy);

      // No existing tenant override
      mockTx.retentionPolicy.findFirst.mockResolvedValue(null);

      const created = {
        ...makeTenantOverride('attendance_records', 48),
        id: 'new-override-id',
      };
      mockTx.retentionPolicy.create.mockResolvedValue(created);

      const result = await service.overridePolicy(TENANT_ID, POLICY_ID, {
        retention_months: 48,
      });

      expect(result).toEqual(created);
      expect(mockTx.retentionPolicy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          data_category: 'attendance_records',
          retention_months: 48,
          action_on_expiry: 'anonymise',
          is_overridable: true,
          statutory_basis: 'GDPR Article 5(1)(e)',
        }),
      });
    });

    it('should update an existing tenant override', async () => {
      const existingOverride = makeTenantOverride('attendance_records', 36);
      // findRetentionPolicyById for the policy lookup returns the override itself
      gdprFacade.findRetentionPolicyById.mockResolvedValue(existingOverride);
      // findDefaultPolicyByCategory for the platform default lookup
      gdprFacade.findDefaultPolicyByCategory.mockResolvedValue(
        makePlatformDefault('attendance_records', 24),
      );

      // Existing tenant override found in transaction
      mockTx.retentionPolicy.findFirst.mockResolvedValue(existingOverride);
      const updated = { ...existingOverride, retention_months: 60 };
      mockTx.retentionPolicy.update.mockResolvedValue(updated);

      const result = await service.overridePolicy(TENANT_ID, OVERRIDE_ID, {
        retention_months: 60,
      });

      expect(result).toEqual(updated);
      expect(mockTx.retentionPolicy.update).toHaveBeenCalledWith({
        where: { id: OVERRIDE_ID },
        data: { retention_months: 60 },
      });
    });

    it('should throw POLICY_NOT_OVERRIDABLE for non-overridable policies', async () => {
      const lockedPolicy = makePlatformDefault('child_protection_safeguarding', 0, {
        is_overridable: false,
      });
      gdprFacade.findRetentionPolicyById.mockResolvedValue(lockedPolicy);

      await expect(
        service.overridePolicy(TENANT_ID, POLICY_ID, { retention_months: 12 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.overridePolicy(TENANT_ID, POLICY_ID, { retention_months: 12 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'POLICY_NOT_OVERRIDABLE' }),
      });
    });

    it('should throw RETENTION_BELOW_MINIMUM when reducing below statutory minimum', async () => {
      const defaultPolicy = makePlatformDefault('financial_records', 84);
      gdprFacade.findRetentionPolicyById.mockResolvedValue(defaultPolicy);

      await expect(
        service.overridePolicy(TENANT_ID, POLICY_ID, { retention_months: 60 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.overridePolicy(TENANT_ID, POLICY_ID, { retention_months: 60 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RETENTION_BELOW_MINIMUM' }),
      });
    });

    it('should throw NotFoundException when policy does not exist', async () => {
      gdprFacade.findRetentionPolicyById.mockResolvedValue(null);

      await expect(
        service.overridePolicy(TENANT_ID, POLICY_ID, { retention_months: 48 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── previewRetention ─────────────────────────────────────────────────────

  describe('previewRetention', () => {
    it('should return counts for all categories', async () => {
      const policies = [
        makePlatformDefault('attendance_records', 24),
        makePlatformDefault('audit_logs', 84, {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }),
      ];

      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue(policies);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);

      attendanceFacade.countAttendanceRecords.mockResolvedValue(150);
      auditLogFacade.count.mockResolvedValue(3000);

      const result = await service.previewRetention(TENANT_ID);

      expect(result.data).toHaveLength(2);

      const attendance = result.data.find((r) => r.data_category === 'attendance_records');
      expect(attendance).toEqual({
        data_category: 'attendance_records',
        retention_months: 24,
        action_on_expiry: 'anonymise',
        affected_count: 150,
      });

      const audit = result.data.find((r) => r.data_category === 'audit_logs');
      expect(audit).toEqual({
        data_category: 'audit_logs',
        retention_months: 84,
        action_on_expiry: 'anonymise',
        affected_count: 3000,
      });
    });

    it('should filter by data_category when specified', async () => {
      const policies = [
        makePlatformDefault('attendance_records', 24),
        makePlatformDefault('audit_logs', 84, {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }),
      ];

      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue(policies);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);

      attendanceFacade.countAttendanceRecords.mockResolvedValue(150);

      const result = await service.previewRetention(TENANT_ID, {
        data_category: 'attendance_records',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.data_category).toBe('attendance_records');
      expect(auditLogFacade.count).not.toHaveBeenCalled();
    });

    it('should return 0 for child_protection_safeguarding (indefinite)', async () => {
      const policies = [
        makePlatformDefault('child_protection_safeguarding', 0, {
          is_overridable: false,
        }),
      ];

      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue(policies);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);

      const result = await service.previewRetention(TENANT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.affected_count).toBe(0);
    });
  });

  // ─── createHold ───────────────────────────────────────────────────────────

  describe('createHold', () => {
    const holdDto: { subject_type: 'student'; subject_id: string; reason: string } = {
      subject_type: 'student',
      subject_id: SUBJECT_ID,
      reason: 'Legal proceedings — do not delete',
    };

    it('should create a legal hold', async () => {
      gdprFacade.findActiveRetentionHoldBySubject.mockResolvedValue(null);

      const createdHold = {
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        reason: holdDto.reason,
        held_by_user_id: USER_ID,
        held_at: new Date(),
        released_at: null,
        created_at: new Date(),
      };
      mockTx.retentionHold.create.mockResolvedValue(createdHold);

      const result = await service.createHold(TENANT_ID, USER_ID, holdDto);

      expect(result).toEqual(createdHold);
      expect(mockTx.retentionHold.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          reason: holdDto.reason,
          held_by_user_id: USER_ID,
        }),
      });
    });

    it('should throw HOLD_ALREADY_ACTIVE when a duplicate active hold exists', async () => {
      gdprFacade.findActiveRetentionHoldBySubject.mockResolvedValue({
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        released_at: null,
      });

      await expect(service.createHold(TENANT_ID, USER_ID, holdDto)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.createHold(TENANT_ID, USER_ID, holdDto)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_ALREADY_ACTIVE' }),
      });
    });
  });

  // ─── releaseHold ──────────────────────────────────────────────────────────

  describe('releaseHold', () => {
    it('should release an active hold', async () => {
      const activeHold = {
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        reason: 'Legal proceedings',
        held_by_user_id: USER_ID,
        held_at: new Date('2026-01-01'),
        released_at: null,
        created_at: new Date('2026-01-01'),
      };
      gdprFacade.findRetentionHoldById.mockResolvedValue(activeHold);

      const releasedHold = { ...activeHold, released_at: new Date() };
      mockTx.retentionHold.update.mockResolvedValue(releasedHold);

      const result = (await service.releaseHold(TENANT_ID, HOLD_ID)) as {
        released_at: Date | null;
      };

      expect(result).toEqual(releasedHold);
      expect(result.released_at).toBeDefined();
      expect(mockTx.retentionHold.update).toHaveBeenCalledWith({
        where: { id: HOLD_ID },
        data: { released_at: expect.any(Date) },
      });
    });

    it('should throw HOLD_NOT_FOUND when hold does not exist', async () => {
      gdprFacade.findRetentionHoldById.mockResolvedValue(null);

      await expect(service.releaseHold(TENANT_ID, HOLD_ID)).rejects.toThrow(NotFoundException);

      await expect(service.releaseHold(TENANT_ID, HOLD_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_NOT_FOUND' }),
      });
    });

    it('should throw HOLD_ALREADY_RELEASED when hold was already released', async () => {
      gdprFacade.findRetentionHoldById.mockResolvedValue({
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        reason: 'Legal proceedings',
        held_by_user_id: USER_ID,
        held_at: new Date('2026-01-01'),
        released_at: new Date('2026-02-01'),
        created_at: new Date('2026-01-01'),
      });

      await expect(service.releaseHold(TENANT_ID, HOLD_ID)).rejects.toThrow(BadRequestException);

      await expect(service.releaseHold(TENANT_ID, HOLD_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_ALREADY_RELEASED' }),
      });
    });
  });

  // ─── previewRetention — countExpiredRecords branches ────────────────────────

  describe('previewRetention — countExpiredRecords category branches', () => {
    const setupPreview = (category: string, retentionMonths: number) => {
      const policy = makePlatformDefault(category, retentionMonths);
      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue([policy]);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);
    };

    it('should count active_student_records via studentReadFacade.count', async () => {
      setupPreview('active_student_records', 12);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count graduated_withdrawn_students via studentReadFacade.count', async () => {
      setupPreview('graduated_withdrawn_students', 24);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count rejected_admissions via admissionsReadFacade', async () => {
      setupPreview('rejected_admissions', 12);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count financial_records via financeReadFacade', async () => {
      setupPreview('financial_records', 84);
      financeFacade.countInvoicesBeforeDate.mockResolvedValue(42);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(42);
    });

    it('should count payroll_records via payrollReadFacade', async () => {
      setupPreview('payroll_records', 84);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count staff_records_post_employment via staffProfileReadFacade', async () => {
      setupPreview('staff_records_post_employment', 36);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count attendance_records via attendanceReadFacade', async () => {
      setupPreview('attendance_records', 24);
      attendanceFacade.countAttendanceRecords.mockResolvedValue(500);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(500);
    });

    it('should count behaviour_records via behaviourReadFacade', async () => {
      setupPreview('behaviour_records', 36);
      behaviourFacade.countIncidentsBeforeDate.mockResolvedValue(25);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(25);
    });

    it('should return 0 for child_protection_safeguarding (never expires)', async () => {
      setupPreview('child_protection_safeguarding', 12);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count communications_notifications via communicationsReadFacade', async () => {
      setupPreview('communications_notifications', 24);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count audit_logs via auditLogReadFacade', async () => {
      setupPreview('audit_logs', 84);
      auditLogFacade.count.mockResolvedValue(1000);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(1000);
    });

    it('should count contact_form_submissions via websiteReadFacade', async () => {
      setupPreview('contact_form_submissions', 12);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count parent_inquiry_messages via parentInquiriesReadFacade', async () => {
      setupPreview('parent_inquiry_messages', 24);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count nl_query_history via gradebookReadFacade', async () => {
      setupPreview('nl_query_history', 12);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should count ai_processing_logs via gdprReadFacade', async () => {
      setupPreview('ai_processing_logs', 6);
      gdprFacade.countTokenUsageLogsBeforeDate.mockResolvedValue(100);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(100);
    });

    it('should count tokenisation_usage_logs via gdprReadFacade', async () => {
      setupPreview('tokenisation_usage_logs', 6);
      gdprFacade.countTokenUsageLogsBeforeDate.mockResolvedValue(50);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(50);
    });

    it('should count s3_compliance_exports via prisma.complianceRequest', async () => {
      setupPreview('s3_compliance_exports', 12);
      prisma.complianceRequest.count.mockResolvedValue(5);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(5);
    });

    it('should return 0 for unknown category (default case)', async () => {
      setupPreview(
        'unknown_category' as ReturnType<typeof makePlatformDefault>['data_category'],
        12,
      );

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
    });

    it('should return 0 when retentionMonths is 0 (indefinite)', async () => {
      setupPreview('attendance_records', 0);

      const result = await service.previewRetention(TENANT_ID);
      expect(result.data[0]!.affected_count).toBe(0);
      // countAttendanceRecords should not be called
      expect(attendanceFacade.countAttendanceRecords).not.toHaveBeenCalled();
    });

    it('should call previewRetention without dto parameter', async () => {
      const policies = [
        makePlatformDefault('attendance_records', 24),
        makePlatformDefault('audit_logs', 84, {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }),
      ];
      gdprFacade.findPlatformDefaultPolicies.mockResolvedValue(policies);
      gdprFacade.findTenantPolicyOverrides.mockResolvedValue([]);
      attendanceFacade.countAttendanceRecords.mockResolvedValue(0);
      auditLogFacade.count.mockResolvedValue(0);

      const result = await service.previewRetention(TENANT_ID);
      // No data_category filter, so both policies are processed
      expect(result.data).toHaveLength(2);
    });
  });

  // ─── listHolds ────────────────────────────────────────────────────────��───

  describe('listHolds', () => {
    it('should return paginated active holds', async () => {
      const holds = [
        {
          id: HOLD_ID,
          tenant_id: TENANT_ID,
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          reason: 'Legal proceedings',
          held_by_user_id: USER_ID,
          held_at: new Date('2026-01-01'),
          released_at: null,
          created_at: new Date('2026-01-01'),
        },
      ];

      gdprFacade.findRetentionHolds.mockResolvedValue({ data: holds, total: 1 });

      const result = await service.listHolds(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual(holds);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
      });
    });

    it('should handle pagination offset correctly', async () => {
      gdprFacade.findRetentionHolds.mockResolvedValue({ data: [], total: 25 });

      const result = await service.listHolds(TENANT_ID, {
        page: 2,
        pageSize: 10,
      });

      expect(result.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 25,
      });
    });
  });
});
