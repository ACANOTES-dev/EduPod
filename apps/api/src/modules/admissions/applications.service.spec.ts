import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../tenants/sequence.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
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
    $queryRaw: jest.Mock;
  };
  let mockSequenceService: { nextNumber: jest.Mock; generateHouseholdReference: jest.Mock };
  let mockRateLimitService: { checkAndIncrement: jest.Mock };
  let mockApprovalRequestsService: { checkAndCreateIfNeeded: jest.Mock };
  let mockSearchIndexService: { indexEntity: jest.Mock };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = 'user-1';
  const IP = '192.168.1.1';

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
        fields: [{ field_key: 'first_name', required: true, field_type: 'short_text', visible_to_parent: true }],
      });
      mockSequenceService.nextNumber.mockResolvedValue('APP-202603-000001');
      mockPrisma.application.create.mockResolvedValue({
        id: 'app-1',
        application_number: 'APP-202603-000001',
        status: 'draft',
      });

      const result = await service.createPublic(TENANT_ID, {
        form_definition_id: 'form-1',
        student_first_name: 'John',
        student_last_name: 'Doe',
        date_of_birth: '2018-05-15',
        payload_json: { first_name: 'John' },
      }, IP) as Record<string, unknown>;

      expect(result.id).toBe('app-1');
      expect(result.application_number).toBe('APP-202603-000001');
      expect(result.status).toBe('draft');
    });

    it('should silently reject honeypot submissions', async () => {
      const result = await service.createPublic(TENANT_ID, {
        form_definition_id: 'form-1',
        student_first_name: 'Bot',
        student_last_name: 'User',
        payload_json: {},
        website_url: 'http://spam.com', // honeypot filled
      }, IP) as Record<string, unknown>;

      expect(result.id).toBe('ignored');
      expect(result.status).toBe('draft');
      // Should NOT have called rate limit or prisma
      expect(mockRateLimitService.checkAndIncrement).not.toHaveBeenCalled();
      expect(mockPrisma.application.create).not.toHaveBeenCalled();
    });

    it('should reject if rate limit exceeded', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(
        service.createPublic(TENANT_ID, {
          form_definition_id: 'form-1',
          student_first_name: 'John',
          student_last_name: 'Doe',
          payload_json: {},
        }, IP),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject for non-published form', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 2 });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.createPublic(TENANT_ID, {
          form_definition_id: 'form-1',
          student_first_name: 'John',
          student_last_name: 'Doe',
          payload_json: {},
        }, IP),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate required fields in payload', async () => {
      mockRateLimitService.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 2 });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue({
        id: 'form-1',
        status: 'published',
        fields: [{
          field_key: 'required_field',
          required: true,
          field_type: 'short_text',
          visible_to_parent: true,
        }],
      });

      await expect(
        service.createPublic(TENANT_ID, {
          form_definition_id: 'form-1',
          student_first_name: 'John',
          student_last_name: 'Doe',
          payload_json: {}, // missing required_field
        }, IP),
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

      await expect(
        service.submit(TENANT_ID, 'app-1', USER_ID),
      ).rejects.toThrow(BadRequestException);
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

      const result = await service.review(TENANT_ID, 'app-1', {
        status: 'under_review',
        expected_updated_at: '2026-01-01T00:00:00.000Z',
      }, USER_ID) as Record<string, unknown>;

      expect(result.status).toBe('under_review');
    });

    it('submitted → rejected', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      const rejectedApp = { ...app, status: 'rejected', rejection_reason: 'Does not meet criteria' };
      // First findFirst returns the app for status check; second returns after update
      mockPrisma.application.findFirst
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(rejectedApp);
      mockPrisma.application.update.mockResolvedValue(rejectedApp);
      mockPrisma.applicationNote.create.mockResolvedValue({});

      const result = await service.review(TENANT_ID, 'app-1', {
        status: 'rejected',
        expected_updated_at: '2026-01-01T00:00:00.000Z',
        rejection_reason: 'Does not meet criteria',
      }, USER_ID) as Record<string, unknown>;

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

      const result = await service.review(TENANT_ID, 'app-1', {
        status: 'pending_acceptance_approval',
        expected_updated_at: '2026-01-01T00:00:00.000Z',
      }, USER_ID) as Record<string, unknown>;

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

      const result = await service.review(TENANT_ID, 'app-1', {
        status: 'pending_acceptance_approval',
        expected_updated_at: '2026-01-01T00:00:00.000Z',
      }, USER_ID) as Record<string, unknown>;

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

      const result = await service.review(TENANT_ID, 'app-1', {
        status: 'rejected',
        expected_updated_at: '2026-01-01T00:00:00.000Z',
        rejection_reason: 'Not suitable',
      }, USER_ID) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
    });

    it('edge: draft → under_review should fail', async () => {
      const app = buildApplication({
        status: 'draft',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(TENANT_ID, 'app-1', {
          status: 'under_review',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: accepted → rejected should fail', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(TENANT_ID, 'app-1', {
          status: 'rejected',
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: concurrent modification should fail', async () => {
      const app = buildApplication({
        status: 'submitted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.review(TENANT_ID, 'app-1', {
          status: 'under_review',
          expected_updated_at: '2026-01-01T12:00:00.000Z', // stale
        }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('should withdraw submitted application', async () => {
      const app = buildApplication({ status: 'submitted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.update.mockResolvedValue({ ...app, status: 'withdrawn' });

      const result = await service.withdraw(TENANT_ID, 'app-1', USER_ID, false) as Record<string, unknown>;

      expect(result.status).toBe('withdrawn');
    });

    it('should reject withdrawing accepted application', async () => {
      const app = buildApplication({ status: 'accepted' });
      mockPrisma.application.findFirst.mockResolvedValue(app);

      await expect(
        service.withdraw(TENANT_ID, 'app-1', USER_ID, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('parent should only withdraw own application', async () => {
      const app = buildApplication({
        status: 'submitted',
        submitted_by_parent_id: 'parent-other',
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-mine' });

      await expect(
        service.withdraw(TENANT_ID, 'app-1', USER_ID, true),
      ).rejects.toThrow(BadRequestException);
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

      const result = await service.convert(TENANT_ID, 'app-1', {
        ...convertDto,
        parent1_link_existing_id: 'existing-parent',
      }, USER_ID);

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

      const result = await service.convert(TENANT_ID, 'app-1', {
        ...convertDto,
        parent2_first_name: 'Bob',
        parent2_last_name: 'Doe',
        parent2_email: 'bob@test.com',
      }, USER_ID);

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

      await expect(
        service.convert(TENANT_ID, 'app-1', convertDto, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if year_group not found', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.convert(TENANT_ID, 'app-1', convertDto, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('edge: concurrent conversion should fail', async () => {
      const app = buildApplication({
        status: 'accepted',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.application.findFirst.mockResolvedValue(app);
      mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.convert(TENANT_ID, 'app-1', {
          ...convertDto,
          expected_updated_at: '2026-01-01T12:00:00.000Z', // stale
        }, USER_ID),
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

      const result = await service.getAnalytics(TENANT_ID, {}) as {
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

      const result = await service.getAnalytics(TENANT_ID, {}) as Record<string, unknown>;

      expect(result.conversion_rate).toBe(30);
    });

    it('should return null avg_days when no decisions', async () => {
      mockPrisma.application.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: null }]);

      const result = await service.getAnalytics(TENANT_ID, {}) as Record<string, unknown>;

      expect(result.avg_days_to_decision).toBeNull();
    });
  });

  // ─── findByParent ─────────────────────────────────────────────────────────

  describe('findByParent', () => {
    it('should return only parent\'s own applications', async () => {
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
