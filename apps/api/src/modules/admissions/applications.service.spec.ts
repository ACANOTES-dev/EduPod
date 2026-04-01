import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationConversionService } from './application-conversion.service';
import { ApplicationStateMachineService } from './application-state-machine.service';
import { ApplicationsService } from './applications.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let mockPrisma: {
    admissionFormDefinition: { findFirst: jest.Mock };
    application: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    applicationNote: { create: jest.Mock; findFirst: jest.Mock };
    parent: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
    yearGroup: { findFirst: jest.Mock; findMany: jest.Mock };
    household: { create: jest.Mock };
    householdParent: { create: jest.Mock };
    student: { create: jest.Mock };
    studentParent: { create: jest.Mock };
    consentRecord: { create: jest.Mock; createMany: jest.Mock; findFirst: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let mockSequenceService: { nextNumber: jest.Mock; generateHouseholdReference: jest.Mock };
  let mockRateLimitService: { checkAndIncrement: jest.Mock };
  let mockApprovalRequestsService: { checkAndCreateIfNeeded: jest.Mock };
  let mockSearchIndexService: { indexEntity: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = 'user-1';
  const IP = '192.168.1.1';
  const DEFAULT_CONSENTS = {
    health_data: false,
    whatsapp_channel: false,
    email_marketing: false,
    photo_use: false,
    cross_school_benchmarking: false,
    homework_diary: false,
    ai_features: {
      ai_grading: false,
      ai_comments: false,
      ai_risk_detection: false,
      ai_progress_summary: false,
    },
  };

  function buildApplication(overrides: Record<string, unknown> = {}) {
    return {
      id: 'app-1',
      tenant_id: TENANT_ID,
      form_definition_id: 'form-1',
      application_number: 'APP-202603-000001',
      submitted_by_parent_id: null,
      student_first_name: 'John',
      student_last_name: 'Doe',
      date_of_birth: new Date('2018-05-15'),
      status: 'draft',
      submitted_at: null,
      reviewed_at: null,
      reviewed_by_user_id: null,
      payload_json: { first_name: 'John' },
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockPrisma = {
      admissionFormDefinition: {
        findFirst: jest.fn(),
      },
      application: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      applicationNote: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      parent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      tenantSetting: {
        findFirst: jest.fn(),
      },
      yearGroup: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      household: {
        create: jest.fn(),
      },
      householdParent: {
        create: jest.fn(),
      },
      student: {
        create: jest.fn(),
      },
      studentParent: {
        create: jest.fn(),
      },
      consentRecord: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    mockSequenceService = {
      nextNumber: jest.fn(),
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-2026-0001'),
    };

    mockRateLimitService = {
      checkAndIncrement: jest.fn(),
    };

    mockApprovalRequestsService = {
      checkAndCreateIfNeeded: jest.fn(),
    };

    mockSearchIndexService = {
      indexEntity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        ApplicationStateMachineService,
        ApplicationConversionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: AdmissionsRateLimitService, useValue: mockRateLimitService },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── createPublic ─────────────────────────────────────────────────────────

  describe('createPublic', () => {
    it('should create draft application with generated number', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 2 });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue({
        id: 'form-1',
        status: 'published',
        fields: [
          {
            field_key: 'first_name',
            required: true,
            field_type: 'short_text',
            visible_to_parent: true,
          },
        ],
      });
      mockSequenceService.nextNumber.mockResolvedValue('APP-202603-000001');
      mockPrisma.application.create.mockResolvedValue({
        id: 'app-1',
        application_number: 'APP-202603-000001',
        status: 'draft',
      });

      const result = (await service.createPublic(
        TENANT_ID,
        {
          form_definition_id: 'form-1',
          student_first_name: 'John',
          student_last_name: 'Doe',
          date_of_birth: '2018-05-15',
          payload_json: { first_name: 'John' },
          consents: {
            ...DEFAULT_CONSENTS,
            health_data: true,
          },
        },
        IP,
      )) as Record<string, unknown>;

      expect(result.id).toBe('app-1');
      expect(result.application_number).toBe('APP-202603-000001');
      expect(result.status).toBe('draft');
    });

    it('should silently reject honeypot submissions', async () => {
      const result = (await service.createPublic(
        TENANT_ID,
        {
          form_definition_id: 'form-1',
          student_first_name: 'Bot',
          student_last_name: 'User',
          payload_json: {},
          consents: DEFAULT_CONSENTS,
          website_url: 'http://spam.com', // honeypot filled
        },
        IP,
      )) as Record<string, unknown>;

      expect(result.id).toBe('ignored');
      expect(result.status).toBe('draft');
      // Should NOT have called rate limit or prisma
      expect(mockRateLimitService.checkAndIncrement).not.toHaveBeenCalled();
      expect(mockPrisma.application.create).not.toHaveBeenCalled();
    });

    it('should reject if rate limit exceeded', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(
        service.createPublic(
          TENANT_ID,
          {
            form_definition_id: 'form-1',
            student_first_name: 'John',
            student_last_name: 'Doe',
            payload_json: {},
            consents: DEFAULT_CONSENTS,
          },
          IP,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject for non-published form', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 2 });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.createPublic(
          TENANT_ID,
          {
            form_definition_id: 'form-1',
            student_first_name: 'John',
            student_last_name: 'Doe',
            payload_json: {},
            consents: DEFAULT_CONSENTS,
          },
          IP,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate required fields in payload', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 2 });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue({
        id: 'form-1',
        status: 'published',
        fields: [
          {
            field_key: 'required_field',
            required: true,
            field_type: 'short_text',
            visible_to_parent: true,
          },
        ],
      });

      await expect(
        service.createPublic(
          TENANT_ID,
          {
            form_definition_id: 'form-1',
            student_first_name: 'John',
            student_last_name: 'Doe',
            payload_json: {}, // missing required_field
            consents: DEFAULT_CONSENTS,
          },
          IP,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submit ──────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('should set status to submitted and link parent', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.application.findMany.mockResolvedValue([]); // no duplicates
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        submitted_by_parent_id: 'parent-1',
        submitted_at: new Date(),
      });
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      const result = await service.submit(TENANT_ID, 'app-1', USER_ID);

      expect(result.status).toBe('submitted');
      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'submitted',
            submitted_by_parent_id: 'parent-1',
          }),
        }),
      );
    });

    it('should create applicant and parent consent records on submit', async () => {
      const app = buildApplication({
        status: 'draft',
        payload_json: {
          first_name: 'John',
          __consents: {
            health_data: true,
            whatsapp_channel: true,
            ai_features: {
              ai_grading: true,
              ai_comments: false,
              ai_risk_detection: false,
              ai_progress_summary: false,
            },
          },
        },
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.application.findMany.mockResolvedValue([]);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        submitted_by_parent_id: 'parent-1',
        submitted_at: new Date(),
      });
      mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.submit(TENANT_ID, 'app-1', USER_ID);

      expect(mockPrisma.consentRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            subject_type: 'applicant',
            consent_type: 'health_data',
          }),
          expect.objectContaining({
            subject_type: 'applicant',
            consent_type: 'ai_grading',
          }),
        ]),
      });
      expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject_type: 'parent',
          subject_id: 'parent-1',
          consent_type: 'whatsapp_channel',
        }),
      });
    });

    it('should detect duplicates by name+DOB', async () => {
      const app = buildApplication({ status: 'draft', date_of_birth: new Date('2018-05-15') });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue(null);
      mockPrisma.application.findMany.mockResolvedValue([
        buildApplication({ id: 'app-2', application_number: 'APP-202603-000002' }),
      ]); // duplicate found
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
      });
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.submit(TENANT_ID, 'app-1', USER_ID);

      // Should have created a duplicate detection note
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_internal: true,
            note: expect.stringContaining('Potential duplicate'),
          }),
        }),
      );
    });

    it('should reject if not in draft status', async () => {
      const app = buildApplication({ status: 'submitted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.submit(TENANT_ID, 'app-1', USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should work without parent record', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue(null); // no parent
      mockPrisma.application.findMany.mockResolvedValue([]);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
        submitted_by_parent_id: null,
      });
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.submit(TENANT_ID, 'app-1', USER_ID);

      expect(mockPrisma.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            submitted_by_parent_id: null,
          }),
        }),
      );
    });
  });

  // ─── review (status transitions) ─────────────────────────────────────────

  describe('review', () => {
    it('submitted → under_review', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'under_review',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'under_review',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('under_review');
    });

    it('submitted → rejected', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      const rejectedApp = {
        ...app,
        status: 'rejected',
        rejection_reason: 'Does not meet criteria',
      };
      // First findFirst returns the app for status check; second returns after update
      mockPrisma.application.findFirst
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(rejectedApp);
      mockPrisma.application.update.mockResolvedValue(rejectedApp);
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'rejected',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
          rejection_reason: 'Does not meet criteria',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
    });

    it('under_review → pending_acceptance_approval (with approval)', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: true } },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-req-1',
      });
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'pending_acceptance_approval',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'pending_acceptance_approval',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('pending_acceptance_approval');
      expect(result.approval_required).toBe(true);
    });

    it('under_review → accepted (no approval needed)', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: false } },
      });
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'accepted',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'pending_acceptance_approval',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('accepted');
    });

    it('under_review → rejected', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      const rejectedApp = { ...app, status: 'rejected', rejection_reason: 'Not suitable' };
      mockPrisma.application.findFirst
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(rejectedApp);
      mockPrisma.application.update.mockResolvedValue(rejectedApp);
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'rejected',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
          rejection_reason: 'Not suitable',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
    });

    it('edge: draft → under_review should fail', async () => {
      const app = buildApplication({
        status: 'draft',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'under_review',
            expected_updated_at: '2026-01-01T00:00:00.000Z',
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: accepted → rejected should fail', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'rejected',
            expected_updated_at: '2026-01-01T00:00:00.000Z',
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: concurrent modification should fail', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'under_review',
            expected_updated_at: '2026-01-01T12:00:00.000Z', // stale
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('should withdraw submitted application', async () => {
      const app = buildApplication({ status: 'submitted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = (await service.withdraw(TENANT_ID, 'app-1', USER_ID, false)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('withdrawn');
    });

    it('should reject withdrawing accepted application', async () => {
      const app = buildApplication({ status: 'accepted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.withdraw(TENANT_ID, 'app-1', USER_ID, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('parent should only withdraw own application', async () => {
      const app = buildApplication({
        status: 'submitted',
        submitted_by_parent_id: 'parent-other',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-mine' });

      await expect(service.withdraw(TENANT_ID, 'app-1', USER_ID, true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── convert ──────────────────────────────────────────────────────────────

  describe('convert', () => {
    const convertDto = {
      student_first_name: 'John',
      student_last_name: 'Doe',
      date_of_birth: '2018-05-15',
      year_group_id: 'yg-1',
      parent1_first_name: 'Jane',
      parent1_last_name: 'Doe',
      parent1_email: 'jane@test.com',
      expected_updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('should create student, parent, household in one transaction', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1', name: 'Grade 1' });
      mockPrisma.parent.create.mockResolvedValue({ id: 'parent-new' });
      mockPrisma.household.create.mockResolvedValue({
        id: 'household-new',
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: 'student-new',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: null,
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      const result = await service.convert(TENANT_ID, 'app-1', convertDto, USER_ID);

      expect(result.student).toBeDefined();
      expect(result.household).toBeDefined();
      expect(result.parent1_id).toBe('parent-new');
      expect(mockPrisma.student.create).toHaveBeenCalled();
      expect(mockPrisma.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            needs_completion: true,
          }),
        }),
      );
    });

    it('should link existing parent by ID', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1' });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'existing-parent' });
      mockPrisma.household.create.mockResolvedValue({
        id: 'hh-1',
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: 'student-1',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: null,
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      const result = await service.convert(
        TENANT_ID,
        'app-1',
        {
          ...convertDto,
          parent1_link_existing_id: 'existing-parent',
        },
        USER_ID,
      );

      expect(result.parent1_id).toBe('existing-parent');
      // Should NOT have called parent.create for parent1
      expect(mockPrisma.parent.create).not.toHaveBeenCalled();
    });

    it('should create new parent when no link provided', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1' });
      mockPrisma.parent.create.mockResolvedValue({ id: 'new-parent' });
      mockPrisma.household.create.mockResolvedValue({
        id: 'hh-1',
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: 'student-1',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: null,
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.convert(TENANT_ID, 'app-1', convertDto, USER_ID);

      expect(mockPrisma.parent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            first_name: 'Jane',
            last_name: 'Doe',
          }),
        }),
      );
    });

    it('should handle parent2 (optional)', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1' });
      mockPrisma.parent.create
        .mockResolvedValueOnce({ id: 'parent1' })
        .mockResolvedValueOnce({ id: 'parent2' });
      mockPrisma.household.create.mockResolvedValue({
        id: 'hh-1',
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: 'student-1',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: null,
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      const result = await service.convert(
        TENANT_ID,
        'app-1',
        {
          ...convertDto,
          parent2_first_name: 'Bob',
          parent2_last_name: 'Doe',
          parent2_email: 'bob@test.com',
        },
        USER_ID,
      );

      expect(result.parent2_id).toBe('parent2');
      expect(mockPrisma.parent.create).toHaveBeenCalledTimes(2);
      // Should create 2 household-parent junctions
      expect(mockPrisma.householdParent.create).toHaveBeenCalledTimes(2);
      // Should create 2 student-parent junctions
      expect(mockPrisma.studentParent.create).toHaveBeenCalledTimes(2);
    });

    it('should reject if not accepted', async () => {
      const app = buildApplication({ status: 'under_review' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.convert(TENANT_ID, 'app-1', convertDto, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if year_group not found', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

      await expect(service.convert(TENANT_ID, 'app-1', convertDto, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: concurrent conversion should fail', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.convert(
          TENANT_ID,
          'app-1',
          {
            ...convertDto,
            expected_updated_at: '2026-01-01T12:00:00.000Z', // stale
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create conversion note', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1' });
      mockPrisma.parent.create.mockResolvedValue({ id: 'p1' });
      mockPrisma.household.create.mockResolvedValue({
        id: 'hh-1',
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: 'student-1',
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: null,
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.convert(TENANT_ID, 'app-1', convertDto, USER_ID);

      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_internal: true,
            note: expect.stringContaining('Converted to student'),
          }),
        }),
      );
    });
  });

  // ─── review — additional state machine coverage ──────────────────────────

  describe('review — exhaustive blocked transitions', () => {
    const TIMESTAMP = '2026-01-01T00:00:00.000Z';

    it('edge: rejected → under_review should fail', async () => {
      const app = buildApplication({
        status: 'rejected',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'under_review',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: rejected → pending_acceptance_approval should fail', async () => {
      const app = buildApplication({
        status: 'rejected',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'pending_acceptance_approval',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: withdrawn → under_review should fail', async () => {
      const app = buildApplication({
        status: 'withdrawn',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'under_review',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: pending_acceptance_approval → under_review should fail', async () => {
      const app = buildApplication({
        status: 'pending_acceptance_approval',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'under_review',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: submitted → pending_acceptance_approval should fail (must go through under_review)', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'pending_acceptance_approval',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('pending_acceptance_approval → rejected should succeed', async () => {
      const app = buildApplication({
        status: 'pending_acceptance_approval',
        updated_at: new Date(TIMESTAMP),
      });
      const rejectedApp = { ...app, status: 'rejected', rejection_reason: 'Board declined' };
      mockPrisma.application.findFirst
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(rejectedApp);
      mockPrisma.application.update.mockResolvedValue(rejectedApp);
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'rejected',
          expected_updated_at: TIMESTAMP,
          rejection_reason: 'Board declined',
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
    });

    it('should require rejection_reason when rejecting', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'rejected',
            expected_updated_at: TIMESTAMP,
            rejection_reason: '',
          },
          USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.review(
          TENANT_ID,
          'app-1',
          {
            status: 'rejected',
            expected_updated_at: TIMESTAMP,
            rejection_reason: '   ',
          },
          USER_ID,
        );
      } catch (e) {
        const err = e as BadRequestException;
        const response = err.getResponse() as Record<string, Record<string, string>>;
        expect(response.error?.code).toBe('REJECTION_REASON_REQUIRED');
      }
    });

    it('should throw NotFoundException when application does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.review(
          TENANT_ID,
          'nonexistent',
          {
            status: 'under_review',
            expected_updated_at: TIMESTAMP,
          },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── review — approval flow deep coverage ─────────────────────────────────

  describe('review — approval flow', () => {
    const TIMESTAMP = '2026-01-01T00:00:00.000Z';

    it('under_review → accepted directly when auto-approved', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: true } },
      });
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: true,
        request_id: null,
      });
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'accepted',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'pending_acceptance_approval',
          expected_updated_at: TIMESTAMP,
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('accepted');
    });

    it('should respect tenant setting disabling approval requirement', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: false } },
      });
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'accepted',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'pending_acceptance_approval',
          expected_updated_at: TIMESTAMP,
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.status).toBe('accepted');
      // Should NOT have called approval service
      expect(mockApprovalRequestsService.checkAndCreateIfNeeded).not.toHaveBeenCalled();
    });

    it('should handle missing tenant settings (defaults to approval required)', async () => {
      const app = buildApplication({
        status: 'under_review',
        updated_at: new Date(TIMESTAMP),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-req-2',
      });
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'pending_acceptance_approval',
      });

      const result = (await service.review(
        TENANT_ID,
        'app-1',
        {
          status: 'pending_acceptance_approval',
          expected_updated_at: TIMESTAMP,
        },
        USER_ID,
      )) as Record<string, unknown>;

      expect(result.approval_required).toBe(true);
      expect(result.approval_request_id).toBe('approval-req-2');
    });
  });

  // ─── withdraw — additional coverage ──────────────────────────────────────

  describe('withdraw — additional coverage', () => {
    it('should allow withdrawing a draft application', async () => {
      const app = buildApplication({ status: 'draft' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = (await service.withdraw(TENANT_ID, 'app-1', USER_ID, false)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('withdrawn');
    });

    it('should allow withdrawing under_review application', async () => {
      const app = buildApplication({ status: 'under_review' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = (await service.withdraw(TENANT_ID, 'app-1', USER_ID, false)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('withdrawn');
    });

    it('should allow withdrawing pending_acceptance_approval application', async () => {
      const app = buildApplication({ status: 'pending_acceptance_approval' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = (await service.withdraw(TENANT_ID, 'app-1', USER_ID, false)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('withdrawn');
    });

    it('edge: should reject withdrawing rejected application', async () => {
      const app = buildApplication({ status: 'rejected' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.withdraw(TENANT_ID, 'app-1', USER_ID, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('edge: should reject withdrawing withdrawn application', async () => {
      const app = buildApplication({ status: 'withdrawn' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.withdraw(TENANT_ID, 'app-1', USER_ID, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for missing application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.withdraw(TENANT_ID, 'nonexistent', USER_ID, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('parent should be able to withdraw own application', async () => {
      const app = buildApplication({
        status: 'submitted',
        submitted_by_parent_id: 'parent-mine',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-mine' });
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = (await service.withdraw(TENANT_ID, 'app-1', USER_ID, true)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('withdrawn');
    });

    it('edge: parent without a parent record should fail to withdraw', async () => {
      const app = buildApplication({
        status: 'submitted',
        submitted_by_parent_id: 'parent-other',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(service.withdraw(TENANT_ID, 'app-1', USER_ID, true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── submit — additional coverage ────────────────────────────────────────

  describe('submit — ownership guard', () => {
    it('should throw ForbiddenException when parent does not own application', async () => {
      const app = buildApplication({
        status: 'draft',
        submitted_by_parent_id: 'parent-other',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-mine' });

      await expect(service.submit(TENANT_ID, 'app-1', USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.submit(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should skip duplicate detection when date_of_birth is null', async () => {
      const app = buildApplication({
        status: 'draft',
        date_of_birth: null,
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue(null);
      mockPrisma.application.update.mockResolvedValue({
        ...app,
        status: 'submitted',
      });
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);

      await service.submit(TENANT_ID, 'app-1', USER_ID);

      // findMany should NOT have been called for duplicate check
      expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return application with full detail', async () => {
      const appDetail = {
        ...buildApplication(),
        form_definition: { id: 'form-1', name: 'Test', version_number: 1, fields: [] },
        submitted_by: null,
        reviewed_by: null,
        notes: [],
      };
      mockPrisma.application.findFirst.mockResolvedValue(appDetail);

      const result = await service.findOne(TENANT_ID, 'app-1');

      expect(result).toBeDefined();
      expect(result.form_definition).toBeDefined();
    });

    it('should throw NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── preview ──────────────────────────────────────────────────────────────

  describe('preview', () => {
    it('should return preview data with entity_type and facts', async () => {
      const app = {
        id: 'app-1',
        application_number: 'APP-202603-000001',
        student_first_name: 'John',
        student_last_name: 'Doe',
        status: 'submitted',
        submitted_at: new Date('2026-03-01'),
        created_at: new Date('2026-02-15'),
        form_definition: { name: 'Application Form' },
      };
      mockPrisma.application.findFirst.mockResolvedValue(app);

      const result = (await service.preview(TENANT_ID, 'app-1')) as {
        entity_type: string;
        primary_label: string;
        secondary_label: string;
        facts: Array<{ label: string; value: string }>;
      };

      expect(result.entity_type).toBe('application');
      expect(result.primary_label).toBe('John Doe');
      expect(result.secondary_label).toBe('APP-202603-000001');
      expect(result.facts).toHaveLength(3);
    });

    it('should show "Not yet" for unsubmitted applications', async () => {
      const app = {
        id: 'app-1',
        application_number: 'APP-202603-000001',
        student_first_name: 'John',
        student_last_name: 'Doe',
        status: 'draft',
        submitted_at: null,
        created_at: new Date('2026-02-15'),
        form_definition: { name: 'Application Form' },
      };
      mockPrisma.application.findFirst.mockResolvedValue(app);

      const result = (await service.preview(TENANT_ID, 'app-1')) as {
        facts: Array<{ label: string; value: string }>;
      };

      const submittedFact = result.facts.find((f) => f.label === 'Submitted');
      expect(submittedFact?.value).toBe('Not yet');
    });

    it('should throw NotFoundException for missing application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.preview(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getConversionPreview ─────────────────────────────────────────────────

  describe('getConversionPreview', () => {
    it('should return preview data for accepted application', async () => {
      const app = buildApplication({
        status: 'accepted',
        payload_json: { parent_email: 'jane@test.com' },
        submitted_by: {
          id: 'p1',
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@test.com',
          phone: null,
        },
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findMany.mockResolvedValue([]);
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: 'yg-1', name: 'Grade 1', display_order: 1 },
      ]);

      const result = (await service.getConversionPreview(TENANT_ID, 'app-1')) as {
        application: Record<string, unknown>;
        year_groups: Array<{ id: string }>;
      };

      expect(result.application).toBeDefined();
      expect(result.year_groups).toHaveLength(1);
    });

    it('should throw NotFoundException for missing application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.getConversionPreview(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject non-accepted applications', async () => {
      const app = buildApplication({ status: 'under_review' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(service.getConversionPreview(TENANT_ID, 'app-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      mockPrisma.application.findMany.mockResolvedValue([buildApplication({ id: 'app-1' })]);
      mockPrisma.application.count.mockResolvedValue(1);

      const result = (await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        order: 'desc' as const,
      })) as { data: unknown[]; meta: { page: number; pageSize: number; total: number } };

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should filter by status', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      mockPrisma.application.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        order: 'desc' as const,
        status: 'submitted',
      });

      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'submitted',
          }),
        }),
      );
    });

    it('should filter by search term across name and application_number', async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      mockPrisma.application.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        order: 'desc' as const,
        search: 'John',
      });

      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                student_first_name: expect.objectContaining({ contains: 'John' }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  // ─── analytics ────────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('should return correct funnel counts', async () => {
      mockPrisma.application.count
        .mockResolvedValueOnce(2) // draft
        .mockResolvedValueOnce(5) // submitted
        .mockResolvedValueOnce(1) // under_review
        .mockResolvedValueOnce(0) // pending_acceptance_approval
        .mockResolvedValueOnce(3) // accepted
        .mockResolvedValueOnce(1) // rejected
        .mockResolvedValueOnce(0); // withdrawn
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: 5.2 }]);

      const result = (await service.getAnalytics(TENANT_ID, {})) as {
        funnel: Record<string, number>;
        total: number;
        conversion_rate: number;
        avg_days_to_decision: number | null;
      };

      expect(result.funnel.draft).toBe(2);
      expect(result.funnel.submitted).toBe(5);
      expect(result.funnel.accepted).toBe(3);
      expect(result.total).toBe(12);
    });

    it('should calculate conversion rate', async () => {
      mockPrisma.application.count
        .mockResolvedValueOnce(0) // draft
        .mockResolvedValueOnce(7) // submitted
        .mockResolvedValueOnce(0) // under_review
        .mockResolvedValueOnce(0) // pending
        .mockResolvedValueOnce(3) // accepted
        .mockResolvedValueOnce(0) // rejected
        .mockResolvedValueOnce(0); // withdrawn
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: 3.0 }]);

      const result = (await service.getAnalytics(TENANT_ID, {})) as Record<string, unknown>;

      expect(result.conversion_rate).toBe(30);
    });

    it('should return null avg_days when no decisions', async () => {
      mockPrisma.application.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: null }]);

      const result = (await service.getAnalytics(TENANT_ID, {})) as Record<string, unknown>;

      expect(result.avg_days_to_decision).toBeNull();
    });
  });

  // ─── findByParent ─────────────────────────────────────────────────────────

  describe('findByParent', () => {
    it("should return only parent's own applications", async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.application.findMany.mockResolvedValue([
        buildApplication({ id: 'app-1' }),
        buildApplication({ id: 'app-2' }),
      ]);

      const result = await service.findByParent(TENANT_ID, USER_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            submitted_by_parent_id: 'parent-1',
          }),
        }),
      );
    });

    it('should return empty array if no parent record', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      const result = await service.findByParent(TENANT_ID, USER_ID);

      expect(result).toEqual([]);
    });
  });
});
