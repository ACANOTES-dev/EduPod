import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AgeGateService } from '../gdpr/age-gate.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PastoralDsarService } from '../pastoral/services/pastoral-dsar.service';
import { PrismaService } from '../prisma/prisma.service';

import { AccessExportService } from './access-export.service';
import { AnonymisationService } from './anonymisation.service';
import { ComplianceService } from './compliance.service';
import { DsarTraversalService } from './dsar-traversal.service';

const TENANT_ID = 'tenant-uuid-1';
const OTHER_TENANT_ID = 'tenant-uuid-2';
const USER_ID = 'user-uuid-1';
const REQUEST_ID = 'request-uuid-1';
const SUBJECT_ID = 'subject-uuid-1';

const REQUESTED_BY_SELECT = {
  id: USER_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@school.test',
};

function buildMockRequest(overrides: Partial<Record<string, unknown>> = {}) {
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
    created_at: new Date(),
    updated_at: new Date(),
    requested_by: REQUESTED_BY_SELECT,
    ...overrides,
  };
}

describe('ComplianceService', () => {
  let service: ComplianceService;
  let mockPrisma: {
    complianceRequest: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    parent: { findFirst: jest.Mock };
    student: { findFirst: jest.Mock };
    household: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    staffProfile: { findFirst: jest.Mock };
    application: { findFirst: jest.Mock };
    consentRecord: { deleteMany: jest.Mock };
    gdprAnonymisationToken: { deleteMany: jest.Mock };
  };
  let mockAccessExport: { exportSubjectData: jest.Mock; exportDataPackage: jest.Mock };
  let mockAnonymisation: { anonymiseSubject: jest.Mock };
  let mockPastoralDsar: {
    routeForReview: jest.Mock;
    allReviewsComplete: jest.Mock;
    getReviewedRecords: jest.Mock;
  };
  let mockDsarTraversal: { collectAllData: jest.Mock };
  let mockGdprTokenService: { processOutbound: jest.Mock };
  let mockAgeGateService: {
    checkStudentAgeGated: jest.Mock;
    isStudentAgeGated: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      complianceRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      parent: { findFirst: jest.fn() },
      student: { findFirst: jest.fn() },
      household: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      staffProfile: { findFirst: jest.fn() },
      application: { findFirst: jest.fn() },
      consentRecord: { deleteMany: jest.fn() },
      gdprAnonymisationToken: { deleteMany: jest.fn() },
    };

    mockAccessExport = {
      exportSubjectData: jest.fn(),
      exportDataPackage: jest.fn(),
    };

    mockAnonymisation = {
      anonymiseSubject: jest.fn(),
    };

    mockPastoralDsar = {
      routeForReview: jest.fn().mockResolvedValue({ reviewCount: 0, tier3Count: 0 }),
      allReviewsComplete: jest.fn().mockResolvedValue(true),
      getReviewedRecords: jest.fn().mockResolvedValue([]),
    };

    mockDsarTraversal = {
      collectAllData: jest.fn(),
    };

    mockGdprTokenService = {
      processOutbound: jest.fn().mockResolvedValue({
        processedData: { entities: [], entityCount: 1 },
        tokenMap: null,
      }),
    };

    mockAgeGateService = {
      checkStudentAgeGated: jest.fn().mockResolvedValue(false),
      isStudentAgeGated: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccessExportService, useValue: mockAccessExport },
        { provide: AnonymisationService, useValue: mockAnonymisation },
        { provide: PastoralDsarService, useValue: mockPastoralDsar },
        { provide: DsarTraversalService, useValue: mockDsarTraversal },
        { provide: AgeGateService, useValue: mockAgeGateService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);

    mockPastoralDsar.routeForReview
      .mockReset()
      .mockResolvedValue({ reviewCount: 0, tier3Count: 0 });
    mockPastoralDsar.allReviewsComplete.mockReset().mockResolvedValue(true);
    mockPastoralDsar.getReviewedRecords.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('should create a compliance request for a valid parent subject', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(result.requested_by).toEqual(REQUESTED_BY_SELECT);
      expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'submitted',
            requested_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should create a compliance request for a valid student subject', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ subject_type: 'student', status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.student.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
    });

    it('should create a compliance request for a valid household subject', async () => {
      mockPrisma.household.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ subject_type: 'household', status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'erasure',
        subject_type: 'household',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.household.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
    });

    it('should create a compliance request for a valid user subject (lookup without tenant_id)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ subject_type: 'user', status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'user',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      // user lookup must NOT include tenant_id
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID },
        select: { id: true },
      });
    });

    it('should throw SUBJECT_NOT_FOUND when parent does not exist', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'parent',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.complianceRequest.create).not.toHaveBeenCalled();
    });

    it('should throw SUBJECT_NOT_FOUND when student does not exist', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.complianceRequest.create).not.toHaveBeenCalled();
    });

    it('should throw DUPLICATE_REQUEST when active request exists (status not completed/rejected)', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'submitted' }),
      );

      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'parent',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.complianceRequest.create).not.toHaveBeenCalled();
    });

    it('should allow creation when prior request is completed', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      // findFirst for duplicate check returns null (completed requests are excluded by the notIn filter)
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalled();
    });

    it('should allow creation when prior request is rejected', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      // findFirst for duplicate check returns null (rejected requests are excluded by the notIn filter)
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('should return paginated compliance requests', async () => {
      const requests = [buildMockRequest(), buildMockRequest({ id: 'request-uuid-2' })];
      mockPrisma.complianceRequest.findMany.mockResolvedValue(requests);
      mockPrisma.complianceRequest.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockPrisma.complianceRequest.findMany.mockResolvedValue([]);
      mockPrisma.complianceRequest.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'submitted' });

      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'submitted' },
        }),
      );
    });

    it('should include requested_by user details', async () => {
      mockPrisma.complianceRequest.findMany.mockResolvedValue([buildMockRequest()]);
      mockPrisma.complianceRequest.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!.requested_by).toEqual(REQUESTED_BY_SELECT);
      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            requested_by: expect.objectContaining({
              select: { id: true, first_name: true, last_name: true, email: true },
            }),
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // get
  // ---------------------------------------------------------------------------

  describe('get', () => {
    it('should return a single compliance request', async () => {
      const request = buildMockRequest();
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      const result = await service.get(TENANT_ID, REQUEST_ID);

      expect(result.id).toBe(REQUEST_ID);
      expect(result.requested_by).toEqual(REQUESTED_BY_SELECT);
      expect(mockPrisma.complianceRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw COMPLIANCE_REQUEST_NOT_FOUND for invalid ID', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      await expect(service.get(TENANT_ID, 'non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw COMPLIANCE_REQUEST_NOT_FOUND for wrong tenant', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      await expect(service.get(OTHER_TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // classify
  // ---------------------------------------------------------------------------

  describe('classify', () => {
    it('should transition submitted to classified', async () => {
      const submitted = buildMockRequest({ status: 'submitted' });
      const classified = buildMockRequest({
        status: 'classified',
        classification: 'anonymise',
        decision_notes: 'Data must be removed',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(submitted);
      mockPrisma.complianceRequest.update.mockResolvedValue(classified);

      const result = await service.classify(TENANT_ID, REQUEST_ID, {
        classification: 'anonymise',
        decision_notes: 'Data must be removed',
      });

      expect(result.status).toBe('classified');
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            status: 'classified',
            classification: 'anonymise',
            decision_notes: 'Data must be removed',
          }),
        }),
      );
    });

    it('should throw INVALID_STATUS when not in submitted state', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'classified' }),
      );

      await expect(
        service.classify(TENANT_ID, REQUEST_ID, {
          classification: 'anonymise',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS when already approved', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(
        service.classify(TENANT_ID, REQUEST_ID, {
          classification: 'retain_legal_basis',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS when completed', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'completed' }),
      );

      await expect(
        service.classify(TENANT_ID, REQUEST_ID, {
          classification: 'erase',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should set decision_notes to null when not provided', async () => {
      const submitted = buildMockRequest({ status: 'submitted' });
      const classified = buildMockRequest({
        status: 'classified',
        classification: 'retain_legal_basis',
        decision_notes: null,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(submitted);
      mockPrisma.complianceRequest.update.mockResolvedValue(classified);

      await service.classify(TENANT_ID, REQUEST_ID, {
        classification: 'retain_legal_basis',
      });

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_notes: null,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // approve
  // ---------------------------------------------------------------------------

  describe('approve', () => {
    it('should transition classified to approved', async () => {
      const classified = buildMockRequest({
        status: 'classified',
        classification: 'anonymise',
        decision_notes: 'Existing notes',
      });
      const approved = buildMockRequest({
        status: 'approved',
        classification: 'anonymise',
        decision_notes: 'Existing notes',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(classified);
      mockPrisma.complianceRequest.update.mockResolvedValue(approved);

      const result = await service.approve(TENANT_ID, REQUEST_ID, {});

      expect(result.status).toBe('approved');
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            status: 'approved',
          }),
        }),
      );
    });

    it('should override decision_notes when provided', async () => {
      const classified = buildMockRequest({
        status: 'classified',
        decision_notes: 'Old notes',
      });
      const approved = buildMockRequest({
        status: 'approved',
        decision_notes: 'New notes from approver',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(classified);
      mockPrisma.complianceRequest.update.mockResolvedValue(approved);

      await service.approve(TENANT_ID, REQUEST_ID, {
        decision_notes: 'New notes from approver',
      });

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_notes: 'New notes from approver',
          }),
        }),
      );
    });

    it('should preserve existing decision_notes when not provided', async () => {
      const classified = buildMockRequest({
        status: 'classified',
        decision_notes: 'Preserved notes',
      });
      const approved = buildMockRequest({
        status: 'approved',
        decision_notes: 'Preserved notes',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(classified);
      mockPrisma.complianceRequest.update.mockResolvedValue(approved);

      await service.approve(TENANT_ID, REQUEST_ID, {});

      // dto.decision_notes is undefined, so fallback to request.decision_notes
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_notes: 'Preserved notes',
          }),
        }),
      );
    });

    it('should throw INVALID_STATUS when not classified', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'submitted' }),
      );

      await expect(service.approve(TENANT_ID, REQUEST_ID, {})).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS when already approved', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(service.approve(TENANT_ID, REQUEST_ID, {})).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------

  describe('reject', () => {
    it('should block submitted → rejected (must be classified first)', async () => {
      const submitted = buildMockRequest({ status: 'submitted' });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(submitted);

      await expect(
        service.reject(TENANT_ID, REQUEST_ID, { decision_notes: 'Not needed' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });

    it('should transition classified to rejected', async () => {
      const classified = buildMockRequest({ status: 'classified' });
      const rejected = buildMockRequest({ status: 'rejected' });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(classified);
      mockPrisma.complianceRequest.update.mockResolvedValue(rejected);

      const result = await service.reject(TENANT_ID, REQUEST_ID, {});

      expect(result.status).toBe('rejected');
    });

    it('should throw INVALID_STATUS when already approved', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, {})).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS when completed', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'completed' }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, {})).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS when already rejected', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'rejected' }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, {})).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------

  describe('execute', () => {
    it('should call DsarTraversalService + exportDataPackage for access_export type and set export_file_key', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: { profile: { first_name: 'John' } },
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID, 'json');

      expect(result.status).toBe('completed');
      expect(mockDsarTraversal.collectAllData).toHaveBeenCalledWith(
        TENANT_ID,
        'parent',
        SUBJECT_ID,
      );
      expect(mockAccessExport.exportDataPackage).toHaveBeenCalledWith(
        TENANT_ID,
        REQUEST_ID,
        dataPackage,
        {},
        'json',
      );
      expect(mockGdprTokenService.processOutbound).toHaveBeenCalledWith(
        TENANT_ID,
        'dsar_access_export',
        {
          entities: [
            {
              type: 'parent',
              id: SUBJECT_ID,
              fields: {},
            },
          ],
          entityCount: 1,
        },
        USER_ID,
      );
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            export_file_key: 'compliance-exports/request-uuid-1.json',
          }),
        }),
      );
    });

    it('should pass csv format through to exportDataPackage', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        export_file_key: 'compliance-exports/request-uuid-1.csv',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: { profile: { first_name: 'John' } },
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.csv',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID, 'csv');

      expect(result.status).toBe('completed');
      expect(mockAccessExport.exportDataPackage).toHaveBeenCalledWith(
        TENANT_ID,
        REQUEST_ID,
        dataPackage,
        {},
        'csv',
      );
      expect(mockGdprTokenService.processOutbound).toHaveBeenCalledWith(
        TENANT_ID,
        'dsar_access_export',
        {
          entities: [
            {
              type: 'parent',
              id: SUBJECT_ID,
              fields: {},
            },
          ],
          entityCount: 1,
        },
        USER_ID,
      );
    });

    it('should call anonymisationService for erasure with anonymise classification and clean up consent/tokens', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'erasure',
        classification: 'anonymise',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'erasure',
        classification: 'anonymise',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockAnonymisation.anonymiseSubject.mockResolvedValue({ anonymised_entities: ['parent'] });
      mockPrisma.consentRecord.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.gdprAnonymisationToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('completed');
      expect(mockAnonymisation.anonymiseSubject).toHaveBeenCalledWith(
        TENANT_ID,
        'parent',
        SUBJECT_ID,
      );
      expect(mockPrisma.consentRecord.deleteMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, subject_type: 'parent', subject_id: SUBJECT_ID },
      });
      expect(mockPrisma.gdprAnonymisationToken.deleteMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, entity_type: 'parent', entity_id: SUBJECT_ID },
      });
      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockGdprTokenService.processOutbound).not.toHaveBeenCalled();
    });

    it('should call anonymisationService for rectification with erase classification and clean up consent/tokens', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'rectification',
        classification: 'erase',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'rectification',
        classification: 'erase',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockAnonymisation.anonymiseSubject.mockResolvedValue({ anonymised_entities: ['parent'] });
      mockPrisma.consentRecord.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.gdprAnonymisationToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('completed');
      expect(mockAnonymisation.anonymiseSubject).toHaveBeenCalledWith(
        TENANT_ID,
        'parent',
        SUBJECT_ID,
      );
      expect(mockPrisma.consentRecord.deleteMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, subject_type: 'parent', subject_id: SUBJECT_ID },
      });
      expect(mockPrisma.gdprAnonymisationToken.deleteMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, entity_type: 'parent', entity_id: SUBJECT_ID },
      });
      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockGdprTokenService.processOutbound).not.toHaveBeenCalled();
    });

    it('should NOT call either service for erasure with retain classification', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'erasure',
        classification: 'retain',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'erasure',
        classification: 'retain',
        export_file_key: null,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('completed');
      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockAnonymisation.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockGdprTokenService.processOutbound).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            export_file_key: null,
          }),
        }),
      );
    });

    it('should throw INVALID_STATUS when not approved', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'classified' }),
      );

      await expect(service.execute(TENANT_ID, REQUEST_ID)).rejects.toThrow(BadRequestException);

      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockAnonymisation.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should set export_file_key to null when not access_export', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'erasure',
        classification: 'retain',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'erasure',
        export_file_key: null,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      await service.execute(TENANT_ID, REQUEST_ID);

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            export_file_key: null,
          }),
        }),
      );
    });

    it('should route pastoral records for DSAR review when executing student access_export', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        requested_by_user_id: USER_ID,
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        subject_type: 'student',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: {},
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      await service.execute(TENANT_ID, REQUEST_ID);

      expect(mockPastoralDsar.routeForReview).toHaveBeenCalledWith(
        TENANT_ID,
        REQUEST_ID,
        SUBJECT_ID,
        USER_ID,
      );
      expect(mockPastoralDsar.allReviewsComplete).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
    });

    it('should leave the request approved when student pastoral DSAR reviews are still pending', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        requested_by_user_id: USER_ID,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValueOnce(approved).mockResolvedValueOnce({
        ...approved,
        requested_by: REQUESTED_BY_SELECT,
      });
      mockPastoralDsar.allReviewsComplete.mockResolvedValue(false);

      const result = await service.execute(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('approved');
      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should include reviewed pastoral DSAR records in the completed student export', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        requested_by_user_id: USER_ID,
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        subject_type: 'student',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const reviewedRecords = [
        {
          review_id: 'review-1',
          entity_type: 'cp_record',
          entity_id: 'cp-1',
          decision: 'include',
          tier: 3,
          record_data: { narrative: 'Included after DLP review' },
        },
      ];
      const dataPackage = {
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: { profile: { first_name: 'Alice' } },
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockPastoralDsar.getReviewedRecords.mockResolvedValue(reviewedRecords);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      await service.execute(TENANT_ID, REQUEST_ID);

      expect(mockPastoralDsar.getReviewedRecords).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
      expect(mockAccessExport.exportDataPackage).toHaveBeenCalledWith(
        TENANT_ID,
        REQUEST_ID,
        dataPackage,
        { pastoral_dsar_records: reviewedRecords },
        'json',
      );
    });

    it('should not route pastoral DSAR for non-student subjects', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        requested_by_user_id: USER_ID,
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        subject_type: 'parent',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: {},
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      await service.execute(TENANT_ID, REQUEST_ID);

      expect(mockPastoralDsar.routeForReview).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getExportUrl
  // ---------------------------------------------------------------------------

  describe('getExportUrl', () => {
    it('should return export_file_key for completed access_export', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          request_type: 'access_export',
          status: 'completed',
          export_file_key: 'compliance-exports/request-uuid-1.json',
        }),
      );

      const result = await service.getExportUrl(TENANT_ID, REQUEST_ID);

      expect(result).toEqual({
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
    });

    it('should throw NOT_FOUND when request_type is not access_export', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          request_type: 'erasure',
          status: 'completed',
          export_file_key: null,
        }),
      );

      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NOT_FOUND when status is not completed', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          request_type: 'access_export',
          status: 'approved',
          export_file_key: null,
        }),
      );

      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw NOT_FOUND when export_file_key is null', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          request_type: 'access_export',
          status: 'completed',
          export_file_key: null,
        }),
      );

      await expect(service.getExportUrl(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return export_file_key for completed portability request', async () => {
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          request_type: 'portability',
          status: 'completed',
          export_file_key: 'compliance-exports/request-uuid-1.json',
        }),
      );

      const result = await service.getExportUrl(TENANT_ID, REQUEST_ID);

      expect(result).toEqual({
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // create — deadline_at
  // ---------------------------------------------------------------------------

  describe('create — deadline_at', () => {
    it('should auto-set deadline_at to 30 days from now', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const before = Date.now();
      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });
      const after = Date.now();

      const createCall = mockPrisma.complianceRequest.create.mock.calls[0]![0] as {
        data: { deadline_at: Date };
      };
      const deadlineMs = createCall.data.deadline_at.getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      expect(deadlineMs).toBeGreaterThanOrEqual(before + thirtyDays);
      expect(deadlineMs).toBeLessThanOrEqual(after + thirtyDays);
    });
  });

  // ---------------------------------------------------------------------------
  // extend
  // ---------------------------------------------------------------------------

  describe('extend', () => {
    it('should grant an extension with deadline_at + 60 days', async () => {
      const deadlineAt = new Date('2026-04-27T00:00:00.000Z');
      const request = buildMockRequest({
        status: 'submitted',
        extension_granted: false,
        deadline_at: deadlineAt,
      });
      const updated = buildMockRequest({
        status: 'submitted',
        extension_granted: true,
        extension_reason: 'Complex request requiring more time',
        extension_deadline_at: new Date(deadlineAt.getTime() + 60 * 24 * 60 * 60 * 1000),
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);
      mockPrisma.complianceRequest.update.mockResolvedValue(updated);

      const result = await service.extend(TENANT_ID, REQUEST_ID, {
        extension_reason: 'Complex request requiring more time',
      });

      expect(result.extension_granted).toBe(true);
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            extension_granted: true,
            extension_reason: 'Complex request requiring more time',
            deadline_exceeded: false,
          }),
        }),
      );

      // Verify the extension_deadline_at is deadline_at + 60 days
      const updateCall = mockPrisma.complianceRequest.update.mock.calls[0]![0] as {
        data: { extension_deadline_at: Date };
      };
      const expectedExtension = new Date(deadlineAt.getTime() + 60 * 24 * 60 * 60 * 1000);
      expect(updateCall.data.extension_deadline_at.getTime()).toBe(expectedExtension.getTime());
    });

    it('should throw EXTENSION_ALREADY_GRANTED when extension already exists', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        extension_granted: true,
        deadline_at: new Date('2026-04-27T00:00:00.000Z'),
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      await expect(
        service.extend(TENANT_ID, REQUEST_ID, {
          extension_reason: 'Another extension attempt',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS for completed requests', async () => {
      const request = buildMockRequest({
        status: 'completed',
        extension_granted: false,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      await expect(
        service.extend(TENANT_ID, REQUEST_ID, {
          extension_reason: 'Try to extend completed',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw INVALID_STATUS for rejected requests', async () => {
      const request = buildMockRequest({
        status: 'rejected',
        extension_granted: false,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      await expect(
        service.extend(TENANT_ID, REQUEST_ID, {
          extension_reason: 'Try to extend rejected',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should fall back to created_at + 30 days when deadline_at is null', async () => {
      const createdAt = new Date('2026-03-28T00:00:00.000Z');
      const request = buildMockRequest({
        status: 'submitted',
        extension_granted: false,
        deadline_at: null,
        created_at: createdAt,
      });
      const updated = buildMockRequest({ extension_granted: true });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);
      mockPrisma.complianceRequest.update.mockResolvedValue(updated);

      await service.extend(TENANT_ID, REQUEST_ID, {
        extension_reason: 'Fallback deadline calculation',
      });

      const updateCall = mockPrisma.complianceRequest.update.mock.calls[0]![0] as {
        data: { extension_deadline_at: Date };
      };
      const baseDeadline = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const expectedExtension = new Date(baseDeadline.getTime() + 60 * 24 * 60 * 60 * 1000);
      expect(updateCall.data.extension_deadline_at.getTime()).toBe(expectedExtension.getTime());
    });
  });

  // ---------------------------------------------------------------------------
  // listOverdue
  // ---------------------------------------------------------------------------

  describe('listOverdue', () => {
    it('should return only overdue requests with pagination', async () => {
      const overdueRequest = buildMockRequest({
        status: 'submitted',
        deadline_at: new Date('2026-01-01'),
        extension_granted: false,
      });

      mockPrisma.complianceRequest.findMany.mockResolvedValue([overdueRequest]);
      mockPrisma.complianceRequest.count.mockResolvedValue(1);

      const result = await service.listOverdue(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: { notIn: ['completed', 'rejected'] },
          }),
          skip: 0,
          take: 20,
          orderBy: { deadline_at: 'asc' },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // execute — portability
  // ---------------------------------------------------------------------------

  describe('execute — portability', () => {
    it('should treat portability the same as access_export', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'portability',
        subject_type: 'parent',
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'portability',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: { profile: { first_name: 'John' } },
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('completed');
      expect(mockDsarTraversal.collectAllData).toHaveBeenCalledWith(
        TENANT_ID,
        'parent',
        SUBJECT_ID,
      );
      expect(mockAccessExport.exportDataPackage).toHaveBeenCalled();
      expect(mockGdprTokenService.processOutbound).toHaveBeenCalledWith(
        TENANT_ID,
        'dsar_portability',
        {
          entities: [
            {
              type: 'parent',
              id: SUBJECT_ID,
              fields: {},
            },
          ],
          entityCount: 1,
        },
        USER_ID,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create — age-gate
  // ---------------------------------------------------------------------------

  describe('create — age-gate', () => {
    it('should auto-flag age-gated review for 17+ student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);
      mockAgeGateService.checkStudentAgeGated.mockResolvedValue(true);

      const created = buildMockRequest({
        subject_type: 'student',
        status: 'submitted',
        age_gated_review: true,
      });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
      });

      expect(result.age_gated_review).toBe(true);
      expect(mockAgeGateService.checkStudentAgeGated).toHaveBeenCalledWith(TENANT_ID, SUBJECT_ID);
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            age_gated_review: true,
          }),
        }),
      );
    });

    it('should NOT flag age-gated review for 16-year-old student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);
      mockAgeGateService.checkStudentAgeGated.mockResolvedValue(false);

      const created = buildMockRequest({
        subject_type: 'student',
        status: 'submitted',
        age_gated_review: false,
      });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
      });

      expect(result.age_gated_review).toBe(false);
      expect(mockAgeGateService.checkStudentAgeGated).toHaveBeenCalledWith(TENANT_ID, SUBJECT_ID);
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            age_gated_review: false,
          }),
        }),
      );
    });

    it('should NOT flag age-gated review for non-student subject', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({
        subject_type: 'parent',
        status: 'submitted',
        age_gated_review: false,
      });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
      });

      expect(mockAgeGateService.checkStudentAgeGated).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            age_gated_review: false,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // confirmAgeGate
  // ---------------------------------------------------------------------------

  describe('confirmAgeGate', () => {
    it('should confirm age-gated review and record confirmer', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_at: null,
        age_gated_confirmed_by: null,
        decision_notes: null,
      });
      const updated = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_by: USER_ID,
        age_gated_confirmed_at: new Date(),
        decision_notes: '[Age-gate confirmation] Student confirmed for processing',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);
      mockPrisma.complianceRequest.update.mockResolvedValue(updated);

      const result = await service.confirmAgeGate(
        TENANT_ID,
        REQUEST_ID,
        USER_ID,
        'Student confirmed for processing',
      );

      expect(result.age_gated_confirmed_by).toBe(USER_ID);
      expect(result.age_gated_confirmed_at).toBeTruthy();
      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            age_gated_confirmed_by: USER_ID,
            decision_notes: '[Age-gate confirmation] Student confirmed for processing',
          }),
        }),
      );
    });

    it('should preserve existing decision_notes when appending age-gate confirmation', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_at: null,
        age_gated_confirmed_by: null,
        decision_notes: 'Existing notes from classification',
      });
      const updated = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_by: USER_ID,
        age_gated_confirmed_at: new Date(),
        decision_notes:
          'Existing notes from classification\n[Age-gate confirmation] Additional notes',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);
      mockPrisma.complianceRequest.update.mockResolvedValue(updated);

      await service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID, 'Additional notes');

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_notes:
              'Existing notes from classification\n[Age-gate confirmation] Additional notes',
          }),
        }),
      );
    });

    it('should keep existing decision_notes unchanged when no confirmation notes provided', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_at: null,
        age_gated_confirmed_by: null,
        decision_notes: 'Existing notes',
      });
      const updated = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_by: USER_ID,
        age_gated_confirmed_at: new Date(),
        decision_notes: 'Existing notes',
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);
      mockPrisma.complianceRequest.update.mockResolvedValue(updated);

      await service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID);

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_notes: 'Existing notes',
          }),
        }),
      );
    });

    it('should throw NOT_AGE_GATED if request is not age-gated', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        age_gated_review: false,
        age_gated_confirmed_at: null,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      await expect(service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should throw ALREADY_CONFIRMED if already confirmed', async () => {
      const request = buildMockRequest({
        status: 'submitted',
        age_gated_review: true,
        age_gated_confirmed_at: new Date(),
        age_gated_confirmed_by: USER_ID,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(request);

      await expect(service.confirmAgeGate(TENANT_ID, REQUEST_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // execute — age-gate block
  // ---------------------------------------------------------------------------

  describe('execute — age-gate block', () => {
    it('should block execution if age-gated but not confirmed', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        age_gated_review: true,
        age_gated_confirmed_at: null,
      });

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);

      await expect(service.execute(TENANT_ID, REQUEST_ID)).rejects.toThrow(BadRequestException);

      expect(mockAccessExport.exportDataPackage).not.toHaveBeenCalled();
      expect(mockAnonymisation.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('should allow execution if age-gated and confirmed', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'parent',
        age_gated_review: true,
        age_gated_confirmed_at: new Date(),
        age_gated_confirmed_by: USER_ID,
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: { profile: { first_name: 'John' } },
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID, 'json');

      expect(result.status).toBe('completed');
      expect(mockDsarTraversal.collectAllData).toHaveBeenCalled();
      expect(mockAccessExport.exportDataPackage).toHaveBeenCalled();
    });

    it('should allow execution when request is not age-gated', async () => {
      const approved = buildMockRequest({
        status: 'approved',
        request_type: 'access_export',
        subject_type: 'parent',
        age_gated_review: false,
        age_gated_confirmed_at: null,
      });
      const completed = buildMockRequest({
        status: 'completed',
        request_type: 'access_export',
        export_file_key: 'compliance-exports/request-uuid-1.json',
      });
      const dataPackage = {
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        collected_at: '2026-03-28T00:00:00.000Z',
        categories: {},
      };

      mockPrisma.complianceRequest.findFirst.mockResolvedValue(approved);
      mockDsarTraversal.collectAllData.mockResolvedValue(dataPackage);
      mockAccessExport.exportDataPackage.mockResolvedValue({
        s3Key: 'compliance-exports/request-uuid-1.json',
      });
      mockPrisma.complianceRequest.update.mockResolvedValue(completed);

      const result = await service.execute(TENANT_ID, REQUEST_ID, 'json');

      expect(result.status).toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  // validateSubjectExists — staff and applicant
  // ---------------------------------------------------------------------------

  describe('validateSubjectExists — staff and applicant', () => {
    it('should validate staff subject via staffProfile', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ subject_type: 'staff', status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'staff',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
    });

    it('should validate applicant subject via application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.complianceRequest.findFirst.mockResolvedValue(null);

      const created = buildMockRequest({ subject_type: 'applicant', status: 'submitted' });
      mockPrisma.complianceRequest.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'applicant',
        subject_id: SUBJECT_ID,
      });

      expect(result.status).toBe('submitted');
      expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        select: { id: true },
      });
    });

    it('should throw SUBJECT_NOT_FOUND when staff does not exist', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'staff',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw SUBJECT_NOT_FOUND when applicant does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          request_type: 'access_export',
          subject_type: 'applicant',
          subject_id: SUBJECT_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
