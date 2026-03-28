/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../../common/middleware/rls.middleware');
import { createRlsClient } from '../../common/middleware/rls.middleware';

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
  invoice: { count: jest.fn() },
  payrollRun: { count: jest.fn() },
  staffProfile: { count: jest.fn() },
  attendanceRecord: { count: jest.fn() },
  behaviourIncident: { count: jest.fn() },
  notification: { count: jest.fn() },
  auditLog: { count: jest.fn() },
  contactFormSubmission: { count: jest.fn() },
  parentInquiryMessage: { count: jest.fn() },
  nlQueryHistory: { count: jest.fn() },
  gdprTokenUsageLog: { count: jest.fn() },
  complianceRequest: { count: jest.fn() },
});

// ─── RLS Mock Setup ─────────────────────────────────────────────────────────

const mockTx = buildMockPrisma();
const mockRlsTransaction = jest.fn().mockImplementation(async (fn) => fn(mockTx));
(createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockRlsTransaction });

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('RetentionPoliciesService', () => {
  let service: RetentionPoliciesService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        RetentionPoliciesService,
        { provide: PrismaService, useValue: prisma },
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

      prisma.retentionPolicy.findMany
        .mockResolvedValueOnce([defaultA, defaultB]) // platform defaults
        .mockResolvedValueOnce([overrideA]); // tenant overrides

      const result = await service.getEffectivePolicies(TENANT_ID);

      expect(result.data).toHaveLength(2);

      // attendance_records should use tenant override
      const attendance = result.data.find(
        (p) => p.data_category === 'attendance_records',
      );
      expect(attendance).toBeDefined();
      expect(attendance!.retention_months).toBe(36);
      expect(attendance!.is_override).toBe(true);
      expect(attendance!.default_retention_months).toBe(24);
      expect(attendance!.tenant_id).toBe(TENANT_ID);

      // audit_logs should use platform default
      const auditLogs = result.data.find(
        (p) => p.data_category === 'audit_logs',
      );
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

      prisma.retentionPolicy.findMany
        .mockResolvedValueOnce([defaultA, defaultB]) // first call: platform defaults (tenant_id = null)
        .mockResolvedValueOnce([]); // second call: Tenant B's overrides — none exist

      const result = await service.getEffectivePolicies(TENANT_B_ID);

      // Every returned policy must be a platform default — no overrides for Tenant B
      expect(result.data.every((p) => p.is_override === false)).toBe(true);

      // Confirm the tenant override query was scoped exclusively to Tenant B
      const findManyCalls = prisma.retentionPolicy.findMany.mock.calls;
      expect(findManyCalls).toHaveLength(2);
      expect(findManyCalls[1]![0]).toMatchObject({ where: { tenant_id: TENANT_B_ID } });
    });
  });

  // ─── overridePolicy ───────────────────────────────────────────────────────

  describe('overridePolicy', () => {
    it('should create a tenant override when extending retention', async () => {
      const defaultPolicy = makePlatformDefault('attendance_records', 24);
      prisma.retentionPolicy.findFirst.mockResolvedValue(defaultPolicy);

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
      // findFirst for the policy lookup returns the override itself
      prisma.retentionPolicy.findFirst.mockResolvedValueOnce(existingOverride);
      // findFirst for the platform default lookup
      prisma.retentionPolicy.findFirst.mockResolvedValueOnce(
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
      const lockedPolicy = makePlatformDefault(
        'child_protection_safeguarding',
        0,
        { is_overridable: false },
      );
      prisma.retentionPolicy.findFirst.mockResolvedValue(lockedPolicy);

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
      prisma.retentionPolicy.findFirst.mockResolvedValue(defaultPolicy);

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
      prisma.retentionPolicy.findFirst.mockResolvedValue(null);

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

      prisma.retentionPolicy.findMany
        .mockResolvedValueOnce(policies) // platform defaults
        .mockResolvedValueOnce([]); // no tenant overrides

      prisma.attendanceRecord.count.mockResolvedValue(150);
      prisma.auditLog.count.mockResolvedValue(3000);

      const result = await service.previewRetention(TENANT_ID);

      expect(result.data).toHaveLength(2);

      const attendance = result.data.find(
        (r) => r.data_category === 'attendance_records',
      );
      expect(attendance).toEqual({
        data_category: 'attendance_records',
        retention_months: 24,
        action_on_expiry: 'anonymise',
        affected_count: 150,
      });

      const audit = result.data.find(
        (r) => r.data_category === 'audit_logs',
      );
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

      prisma.retentionPolicy.findMany
        .mockResolvedValueOnce(policies)
        .mockResolvedValueOnce([]);

      prisma.attendanceRecord.count.mockResolvedValue(150);

      const result = await service.previewRetention(TENANT_ID, {
        data_category: 'attendance_records',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.data_category).toBe('attendance_records');
      expect(prisma.auditLog.count).not.toHaveBeenCalled();
    });

    it('should return 0 for child_protection_safeguarding (indefinite)', async () => {
      const policies = [
        makePlatformDefault('child_protection_safeguarding', 0, {
          is_overridable: false,
        }),
      ];

      prisma.retentionPolicy.findMany
        .mockResolvedValueOnce(policies)
        .mockResolvedValueOnce([]);

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
      prisma.retentionHold.findFirst.mockResolvedValue(null);

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
      prisma.retentionHold.findFirst.mockResolvedValue({
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        released_at: null,
      });

      await expect(
        service.createHold(TENANT_ID, USER_ID, holdDto),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createHold(TENANT_ID, USER_ID, holdDto),
      ).rejects.toMatchObject({
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
      prisma.retentionHold.findFirst.mockResolvedValue(activeHold);

      const releasedHold = { ...activeHold, released_at: new Date() };
      mockTx.retentionHold.update.mockResolvedValue(releasedHold);

      const result = await service.releaseHold(TENANT_ID, HOLD_ID) as { released_at: Date | null };

      expect(result).toEqual(releasedHold);
      expect(result.released_at).toBeDefined();
      expect(mockTx.retentionHold.update).toHaveBeenCalledWith({
        where: { id: HOLD_ID },
        data: { released_at: expect.any(Date) },
      });
    });

    it('should throw HOLD_NOT_FOUND when hold does not exist', async () => {
      prisma.retentionHold.findFirst.mockResolvedValue(null);

      await expect(
        service.releaseHold(TENANT_ID, HOLD_ID),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.releaseHold(TENANT_ID, HOLD_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_NOT_FOUND' }),
      });
    });

    it('should throw HOLD_ALREADY_RELEASED when hold was already released', async () => {
      prisma.retentionHold.findFirst.mockResolvedValue({
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

      await expect(
        service.releaseHold(TENANT_ID, HOLD_ID),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.releaseHold(TENANT_ID, HOLD_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'HOLD_ALREADY_RELEASED' }),
      });
    });
  });

  // ─── listHolds ────────────────────────────────────────────────────────────

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

      prisma.retentionHold.findMany.mockResolvedValue(holds);
      prisma.retentionHold.count.mockResolvedValue(1);

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

      expect(prisma.retentionHold.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, released_at: null },
        skip: 0,
        take: 20,
        orderBy: { held_at: 'desc' },
      });
    });

    it('should handle pagination offset correctly', async () => {
      prisma.retentionHold.findMany.mockResolvedValue([]);
      prisma.retentionHold.count.mockResolvedValue(25);

      const result = await service.listHolds(TENANT_ID, {
        page: 2,
        pageSize: 10,
      });

      expect(result.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 25,
      });

      expect(prisma.retentionHold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });
});
