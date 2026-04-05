import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { AgeGateService } from '../gdpr/age-gate.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PastoralDsarService } from '../pastoral/services/pastoral-dsar.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceService } from './compliance.service';
import { DsarTraversalService } from './dsar-traversal.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REQUEST_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function buildRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REQUEST_ID,
    tenant_id: TENANT_ID,
    request_type: 'access_export',
    subject_type: 'parent',
    subject_id: SUBJECT_ID,
    requested_by_user_id: USER_ID,
    status: 'submitted',
    classification: null,
    decision_notes: null,
    export_file_key: null,
    deadline_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    extension_granted: false,
    extension_deadline_at: null,
    extension_reason: null,
    age_gated_review: false,
    age_gated_confirmed_at: null,
    age_gated_confirmed_by: null,
    deadline_exceeded: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('ComplianceService — branches', () => {
  let service: ComplianceService;
  let mockPrisma: {
    complianceRequest: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mockAgeGate: { checkStudentAgeGated: jest.Mock };
  let mockParentFacade: { findById: jest.Mock };
  let mockStudentFacade: { exists: jest.Mock };
  let mockHouseholdFacade: { findById: jest.Mock };
  let mockStaffFacade: { findById: jest.Mock };
  let mockAdmissionsFacade: { findById: jest.Mock };
  let mockAuthFacade: { findUserById: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      complianceRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          consentRecord: { deleteMany: jest.fn() },
          gdprAnonymisationToken: { deleteMany: jest.fn() },
        }),
      ),
    };
    mockAgeGate = { checkStudentAgeGated: jest.fn().mockResolvedValue(false) };
    mockParentFacade = { findById: jest.fn().mockResolvedValue({ id: SUBJECT_ID }) };
    mockStudentFacade = { exists: jest.fn().mockResolvedValue(true) };
    mockHouseholdFacade = { findById: jest.fn().mockResolvedValue({ id: SUBJECT_ID }) };
    mockStaffFacade = { findById: jest.fn().mockResolvedValue({ id: SUBJECT_ID }) };
    mockAdmissionsFacade = { findById: jest.fn().mockResolvedValue({ id: SUBJECT_ID }) };
    mockAuthFacade = { findUserById: jest.fn().mockResolvedValue({ id: SUBJECT_ID }) };

    const module = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnonymisationService, useValue: { anonymiseSubject: jest.fn() } },
        {
          provide: AccessExportService,
          useValue: { exportDataPackage: jest.fn().mockResolvedValue({ s3Key: 'x' }) },
        },
        {
          provide: PastoralDsarService,
          useValue: {
            routeForReview: jest.fn(),
            allReviewsComplete: jest.fn().mockResolvedValue(true),
            getReviewedRecords: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DsarTraversalService,
          useValue: { collectAllData: jest.fn().mockResolvedValue({ categories: {} }) },
        },
        { provide: AgeGateService, useValue: mockAgeGate },
        { provide: GdprTokenService, useValue: { processOutbound: jest.fn() } },
        ...MOCK_FACADE_PROVIDERS,
        // Override specific facades needed for validateSubjectExists
        { provide: ParentReadFacade, useValue: mockParentFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: HouseholdReadFacade, useValue: mockHouseholdFacade },
        { provide: StaffProfileReadFacade, useValue: mockStaffFacade },
        { provide: AdmissionsReadFacade, useValue: mockAdmissionsFacade },
        { provide: AuthReadFacade, useValue: mockAuthFacade },
      ],
    }).compile();

    service = module.get(ComplianceService);
  });

  afterEach(() => jest.clearAllMocks());

  const complianceReq = () => mockPrisma.complianceRequest;

  // ─── create — subject validation switch branches ────────────────────────
  describe('ComplianceService — create — validate subject types', () => {
    it('should create request for parent subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null); // no existing active
      complianceReq().create.mockResolvedValue(buildRequest());

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should create request for student subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ subject_type: 'student' }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should create request for household subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ subject_type: 'household' }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'household',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should create request for staff subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ subject_type: 'staff' }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'staff',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should create request for applicant subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ subject_type: 'applicant' }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'applicant',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should create request for user subject', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ subject_type: 'user' }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'user',
        subject_id: SUBJECT_ID,
      });
      expect(complianceReq().create).toHaveBeenCalled();
    });

    it('should throw for unknown subject type', async () => {
      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'alien' as never,
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when duplicate active request', async () => {
      // prisma.complianceRequest.findFirst is called once for duplicate check
      complianceReq().findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'parent',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── create — age gate ──────────────────────────────────────────────────
  describe('ComplianceService — create — age gate', () => {
    it('should set age_gated_review for student subjects 17+', async () => {
      mockAgeGate.checkStudentAgeGated.mockResolvedValue(true);
      complianceReq().findFirst.mockResolvedValue(null);
      complianceReq().create.mockResolvedValue(buildRequest({ age_gated_review: true }));

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
      });

      expect(complianceReq().create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ age_gated_review: true }),
        }),
      );
    });
  });

  // ─── extend branches ────────────────────────────────────────────────────
  describe('ComplianceService — extend', () => {
    it('should throw ConflictException when extension already granted', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest({ extension_granted: true }));
      await expect(
        service.extend(TENANT_ID, REQUEST_ID, { extension_reason: 'test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for completed request', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest({ status: 'completed' }));
      await expect(
        service.extend(TENANT_ID, REQUEST_ID, { extension_reason: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use created_at as base when deadline_at is null', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest({ deadline_at: null }));
      complianceReq().update.mockResolvedValue(buildRequest({ extension_granted: true }));

      await service.extend(TENANT_ID, REQUEST_ID, { extension_reason: 'complex' });
      expect(complianceReq().update).toHaveBeenCalled();
    });
  });

  // ─── confirmAgeGate branches ────────────────────────────────────────────
  describe('ComplianceService — confirmAgeGate', () => {
    it('should throw when not age gated', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest({ age_gated_review: false }));
      await expect(service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when already confirmed', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ age_gated_review: true, age_gated_confirmed_at: new Date() }),
      );
      await expect(service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should append notes when provided with existing notes', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ age_gated_review: true, decision_notes: 'Old' }),
      );
      complianceReq().update.mockResolvedValue(buildRequest());

      await service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID, 'New note');

      const data = (complianceReq().update.mock.calls[0]![0] as Record<string, unknown>)
        .data as Record<string, unknown>;
      expect(data.decision_notes).toContain('Old');
      expect(data.decision_notes).toContain('New note');
    });

    it('should keep existing notes when no notes parameter', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ age_gated_review: true, decision_notes: 'Keep' }),
      );
      complianceReq().update.mockResolvedValue(buildRequest());

      await service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID);

      const data = (complianceReq().update.mock.calls[0]![0] as Record<string, unknown>)
        .data as Record<string, unknown>;
      expect(data.decision_notes).toBe('Keep');
    });

    it('should handle null existing decision_notes with new notes', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ age_gated_review: true, decision_notes: null }),
      );
      complianceReq().update.mockResolvedValue(buildRequest());

      await service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID, 'First note');

      const data = (complianceReq().update.mock.calls[0]![0] as Record<string, unknown>)
        .data as Record<string, unknown>;
      expect(data.decision_notes).toContain('First note');
    });
  });

  // ─── getExportUrl branches ──────────────────────────────────────────────
  describe('ComplianceService — getExportUrl', () => {
    it('should throw for non-export request type', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest({ request_type: 'erasure' }));
      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw for non-completed request', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ request_type: 'access_export', status: 'approved' }),
      );
      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw when no export file key', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({ request_type: 'access_export', status: 'completed', export_file_key: null }),
      );
      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return key for valid completed export', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({
          request_type: 'access_export',
          status: 'completed',
          export_file_key: 'key.json',
        }),
      );
      const result = await service.getExportUrl(TENANT_ID, REQUEST_ID);
      expect(result.export_file_key).toBe('key.json');
    });

    it('should work for portability type', async () => {
      complianceReq().findFirst.mockResolvedValue(
        buildRequest({
          request_type: 'portability',
          status: 'completed',
          export_file_key: 'p.json',
        }),
      );
      const result = await service.getExportUrl(TENANT_ID, REQUEST_ID);
      expect(result.export_file_key).toBe('p.json');
    });
  });

  // ─── list — with/without status ─────────────────────────────────────────
  describe('ComplianceService — list', () => {
    it('should filter by status when provided', async () => {
      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'submitted' });
      const where = complianceReq().findMany.mock.calls[0]![0].where as Record<string, unknown>;
      expect(where.status).toBe('submitted');
    });

    it('should not filter by status when not provided', async () => {
      await service.list(TENANT_ID, { page: 1, pageSize: 20 } as never);
      const where = complianceReq().findMany.mock.calls[0]![0].where as Record<string, unknown>;
      expect(where.status).toBeUndefined();
    });
  });

  // ─── get — not found ────────────────────────────────────────────────────
  describe('ComplianceService — get', () => {
    it('should throw NotFoundException when not found', async () => {
      complianceReq().findFirst.mockResolvedValue(null);
      await expect(service.get(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return request when found', async () => {
      complianceReq().findFirst.mockResolvedValue(buildRequest());
      const result = await service.get(TENANT_ID, REQUEST_ID);
      expect(result.id).toBe(REQUEST_ID);
    });
  });

  // ─── listOverdue ────────────────────────────────────────────────────────
  describe('ComplianceService — listOverdue', () => {
    it('should return paginated overdue results', async () => {
      complianceReq().findMany.mockResolvedValue([buildRequest()]);
      complianceReq().count.mockResolvedValue(1);

      const result = await service.listOverdue(TENANT_ID, { page: 1, pageSize: 10 });
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });
});
