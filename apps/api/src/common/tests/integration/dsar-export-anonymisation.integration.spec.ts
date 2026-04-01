/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { AccessExportService } from '../../../modules/compliance/access-export.service';
import { AnonymisationService } from '../../../modules/compliance/anonymisation.service';
import { ComplianceService } from '../../../modules/compliance/compliance.service';
import { DsarTraversalService } from '../../../modules/compliance/dsar-traversal.service';
import { AgeGateService } from '../../../modules/gdpr/age-gate.service';
import { GdprTokenService } from '../../../modules/gdpr/gdpr-token.service';
import { PastoralDsarService } from '../../../modules/pastoral/services/pastoral-dsar.service';
import { PrismaService } from '../../../modules/prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-integration-005';
const USER_ID = 'user-uuid-integration-005';
const REQUEST_ID = 'request-uuid-integration-005';
const STUDENT_ID = 'student-uuid-integration-005';
const PARENT_ID = 'parent-uuid-integration-005';

// ─── Mock factories ──────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  complianceRequest: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  parent: {
    findFirst: jest.fn(),
  },
  consentRecord: {
    deleteMany: jest.fn(),
  },
  gdprAnonymisationToken: {
    deleteMany: jest.fn(),
  },
});

const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  tenant_id: TENANT_ID,
  request_type: 'access_export',
  subject_type: 'student',
  subject_id: STUDENT_ID,
  requested_by_user_id: USER_ID,
  status: 'submitted',
  classification: null,
  decision_notes: null,
  export_file_key: null,
  deadline_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  age_gated_review: false,
  age_gated_confirmed_at: null,
  created_at: new Date(),
  requested_by: {
    id: USER_ID,
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@test.com',
  },
  ...overrides,
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('DSAR -> Export -> Anonymisation flow', () => {
  let complianceService: ComplianceService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const mockAnonymisationService = {
    anonymiseSubject: jest.fn(),
  };

  const mockAccessExportService = {
    exportDataPackage: jest.fn(),
    exportSubjectData: jest.fn(),
  };

  const mockDsarTraversalService = {
    collectAllData: jest.fn(),
  };

  const mockPastoralDsarService = {
    routeForReview: jest.fn(),
    allReviewsComplete: jest.fn(),
    getReviewedRecords: jest.fn(),
  };

  const mockAgeGateService = {
    checkStudentAgeGated: jest.fn(),
  };

  const mockGdprTokenService = {
    processOutbound: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnonymisationService, useValue: mockAnonymisationService },
        { provide: AccessExportService, useValue: mockAccessExportService },
        { provide: DsarTraversalService, useValue: mockDsarTraversalService },
        { provide: PastoralDsarService, useValue: mockPastoralDsarService },
        { provide: AgeGateService, useValue: mockAgeGateService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
      ],
    }).compile();

    complianceService = module.get(ComplianceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a DSAR, classify, approve, and execute access export lifecycle', async () => {
    // Step 1: Create — validate subject exists, no duplicate
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      tenant_id: TENANT_ID,
    });
    mockPrisma.complianceRequest.findFirst.mockResolvedValueOnce(null); // no duplicate
    mockAgeGateService.checkStudentAgeGated.mockResolvedValue(false);
    mockPrisma.complianceRequest.create.mockResolvedValue(makeRequest());

    const created = await complianceService.create(TENANT_ID, USER_ID, {
      request_type: 'access_export',
      subject_type: 'student',
      subject_id: STUDENT_ID,
    });

    expect(created.status).toBe('submitted');
    expect(mockPrisma.complianceRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: STUDENT_ID,
          status: 'submitted',
        }),
      }),
    );

    // Step 2: Classify (retain_legal_basis means data is exported as-is)
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(makeRequest());
    mockPrisma.complianceRequest.update.mockResolvedValue(
      makeRequest({ status: 'classified', classification: 'retain_legal_basis' }),
    );

    const classified = await complianceService.classify(TENANT_ID, REQUEST_ID, {
      classification: 'retain_legal_basis',
    });

    expect(classified.status).toBe('classified');

    // Step 3: Approve
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(
      makeRequest({ status: 'classified', classification: 'retain_legal_basis' }),
    );
    mockPrisma.complianceRequest.update.mockResolvedValue(
      makeRequest({ status: 'approved', classification: 'retain_legal_basis' }),
    );

    const approved = await complianceService.approve(TENANT_ID, REQUEST_ID, {});

    expect(approved.status).toBe('approved');

    // Step 4: Execute — collect data, export, complete
    const approvedRequest = makeRequest({
      status: 'approved',
      classification: 'retain_legal_basis',
    });
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(approvedRequest);

    mockPastoralDsarService.routeForReview.mockResolvedValue(undefined);
    mockPastoralDsarService.allReviewsComplete.mockResolvedValue(true);
    mockPastoralDsarService.getReviewedRecords.mockResolvedValue([]);

    const mockDataPackage = {
      subject_type: 'student',
      subject_id: STUDENT_ID,
      collected_at: new Date().toISOString(),
      categories: {
        profile: { first_name: 'Test', last_name: 'Student' },
        attendance: [{ date: '2026-01-15', status: 'present' }],
      },
    };
    mockDsarTraversalService.collectAllData.mockResolvedValue(mockDataPackage);

    mockAccessExportService.exportDataPackage.mockResolvedValue({
      s3Key: `compliance-exports/${REQUEST_ID}.json`,
    });

    mockPrisma.complianceRequest.update.mockResolvedValue(
      makeRequest({
        status: 'completed',
        export_file_key: `compliance-exports/${REQUEST_ID}.json`,
      }),
    );

    const executed = await complianceService.execute(TENANT_ID, REQUEST_ID);

    expect(executed.status).toBe('completed');
    // DsarTraversalService collected data
    expect(mockDsarTraversalService.collectAllData).toHaveBeenCalledWith(
      TENANT_ID,
      'student',
      STUDENT_ID,
    );
    // AccessExportService exported the package
    expect(mockAccessExportService.exportDataPackage).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      mockDataPackage,
      expect.any(Object),
      'json',
    );
  });

  it('should execute erasure request with anonymisation', async () => {
    const erasureRequest = makeRequest({
      request_type: 'erasure',
      subject_type: 'parent',
      subject_id: PARENT_ID,
      status: 'approved',
      classification: 'anonymise',
    });

    mockPrisma.complianceRequest.findFirst.mockResolvedValue(erasureRequest);
    mockAnonymisationService.anonymiseSubject.mockResolvedValue({
      anonymised_entities: ['parent', 'student_parents'],
    });
    mockPrisma.consentRecord.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.gdprAnonymisationToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.complianceRequest.update.mockResolvedValue(
      makeRequest({ ...erasureRequest, status: 'completed' }),
    );

    const result = await complianceService.execute(TENANT_ID, REQUEST_ID);

    expect(result.status).toBe('completed');
    // Anonymisation was called
    expect(mockAnonymisationService.anonymiseSubject).toHaveBeenCalledWith(
      TENANT_ID,
      'parent',
      PARENT_ID,
    );
    // Consent records cleaned up
    expect(mockPrisma.consentRecord.deleteMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        subject_type: 'parent',
        subject_id: PARENT_ID,
      },
    });
    // Anonymisation tokens cleaned up
    expect(mockPrisma.gdprAnonymisationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        entity_type: 'parent',
        entity_id: PARENT_ID,
      },
    });
  });

  it('should reject duplicate DSAR for same subject', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      tenant_id: TENANT_ID,
    });
    // An active request already exists
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(makeRequest({ status: 'submitted' }));

    await expect(
      complianceService.create(TENANT_ID, USER_ID, {
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: STUDENT_ID,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject execution of non-approved request', async () => {
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(makeRequest({ status: 'classified' }));

    await expect(complianceService.execute(TENANT_ID, REQUEST_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should block execution when age-gate review is required but not confirmed', async () => {
    mockPrisma.complianceRequest.findFirst.mockResolvedValue(
      makeRequest({
        status: 'approved',
        age_gated_review: true,
        age_gated_confirmed_at: null,
      }),
    );

    await expect(complianceService.execute(TENANT_ID, REQUEST_ID)).rejects.toThrow(
      BadRequestException,
    );
  });
});
