import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ParentReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { FormSubmissionsService } from './form-submissions.service';

// ─── RLS Mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  engagementFormSubmission: {
    update: jest.fn(),
  },
  engagementConsentRecord: {
    create: jest.fn(),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  engagementEvent: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Mock Prisma Factory ──────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    engagementFormSubmission: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    engagementFormTemplate: {
      findFirst: jest.fn(),
    },
    engagementConsentRecord: {
      create: jest.fn(),
    },
    parent: {
      findFirst: jest.fn(),
    },
    studentParent: {
      findMany: jest.fn(),
    },
    academicYear: {
      findFirst: jest.fn(),
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUBMISSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const EVENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACADEMIC_YEAR_ID = '11111111-1111-1111-1111-111111111111';
const PARENT_ID = '22222222-2222-2222-2222-222222222222';

const IP_ADDRESS = '192.168.1.1';
const USER_AGENT = 'Mozilla/5.0';

function buildSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    tenant_id: TENANT_ID,
    form_template_id: TEMPLATE_ID,
    event_id: null,
    student_id: STUDENT_ID,
    submitted_by_user_id: null,
    responses_json: {},
    signature_json: null,
    status: 'pending',
    submitted_at: null,
    acknowledged_at: null,
    acknowledged_by_id: null,
    expired_at: null,
    revoked_at: null,
    revocation_reason: null,
    academic_year_id: ACADEMIC_YEAR_ID,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    name: 'Trip Consent Form',
    form_type: 'consent_form',
    consent_type: 'one_time',
    fields_json: [
      { id: 'f1', field_key: 'emergency_contact', field_type: 'short_text', required: true },
    ],
    requires_signature: false,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('FormSubmissionsService', () => {
  let service: FormSubmissionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    // Reset RLS tx mocks
    mockRlsTx.engagementFormSubmission.update.mockReset();
    mockRlsTx.engagementConsentRecord.create.mockReset();
    mockRlsTx.academicYear.findFirst.mockReset();
    mockRlsTx.engagementEvent.findFirst.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        FormSubmissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ParentReadFacade,
          useValue: {
            findByUserId: mockPrisma.parent.findFirst,
            findLinkedStudentIds: jest.fn().mockImplementation(async () => {
              const links = await mockPrisma.studentParent.findMany();
              return (links as Array<{ student_id: string }>).map((l) => l.student_id);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FormSubmissionsService>(FormSubmissionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated results with template and student info', async () => {
      const submissions = [
        {
          id: SUBMISSION_ID,
          form_template_id: TEMPLATE_ID,
          event_id: null,
          student_id: STUDENT_ID,
          status: 'pending',
          submitted_at: null,
          acknowledged_at: null,
          expired_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          form_template: { name: 'Trip Consent', form_type: 'consent_form' },
          student: { first_name: 'Ali', last_name: 'Hassan' },
        },
      ];

      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue(submissions);
      mockPrisma.engagementFormSubmission.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockPrisma.engagementFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should apply optional filters', async () => {
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 10,
        form_template_id: TEMPLATE_ID,
        status: 'pending',
        student_id: STUDENT_ID,
      });

      expect(mockPrisma.engagementFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            form_template_id: TEMPLATE_ID,
            status: 'pending',
            student_id: STUDENT_ID,
          },
        }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return submission with template, student, and consent record', async () => {
      const submission = buildSubmission({
        form_template: buildTemplate(),
        student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan' },
        consent_record: null,
      });

      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(submission);

      const result = await service.findOne(TENANT_ID, SUBMISSION_ID);

      expect(result.id).toBe(SUBMISSION_ID);
      expect(mockPrisma.engagementFormSubmission.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SUBMISSION_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw NotFoundException when submission does not exist', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, SUBMISSION_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submit ─────────────────────────────────────────────────────────────────

  describe('submit', () => {
    const submitDto = {
      responses: { emergency_contact: 'Jane Doe' },
    };

    it('should submit a pending form and update status', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'pending', academic_year_id: ACADEMIC_YEAR_ID }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({ form_type: 'survey', consent_type: null, requires_signature: false }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'submitted', responses_json: submitDto.responses }),
      );

      const result = (await service.submit(
        TENANT_ID,
        SUBMISSION_ID,
        submitDto,
        USER_ID,
        IP_ADDRESS,
        USER_AGENT,
      )) as Record<string, unknown>;

      expect(result.status).toBe('submitted');
      expect(mockRlsTx.engagementFormSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SUBMISSION_ID },
          data: expect.objectContaining({
            status: 'submitted',
            responses_json: submitDto.responses,
            submitted_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should create a consent record for consent_form type', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({
          status: 'pending',
          event_id: EVENT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
        }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({
          form_type: 'consent_form',
          consent_type: 'one_time',
          requires_signature: false,
        }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );
      mockRlsTx.engagementEvent.findFirst.mockResolvedValue({
        end_date: new Date('2026-06-30T00:00:00Z'),
      });
      mockRlsTx.engagementConsentRecord.create.mockResolvedValue({});

      await service.submit(TENANT_ID, SUBMISSION_ID, submitDto, USER_ID, IP_ADDRESS, USER_AGENT);

      expect(mockRlsTx.engagementConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            consent_type: 'one_time',
            form_template_id: TEMPLATE_ID,
            form_submission_id: SUBMISSION_ID,
            event_id: EVENT_ID,
            status: 'active',
          }),
        }),
      );
    });

    it('should set expires_at to academic year end_date for annual consent', async () => {
      const yearEndDate = new Date('2026-08-31T00:00:00Z');

      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({
          status: 'pending',
          academic_year_id: ACADEMIC_YEAR_ID,
        }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({
          form_type: 'consent_form',
          consent_type: 'annual',
          requires_signature: false,
        }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );
      mockRlsTx.academicYear.findFirst.mockResolvedValue({ end_date: yearEndDate });
      mockRlsTx.engagementConsentRecord.create.mockResolvedValue({});

      await service.submit(TENANT_ID, SUBMISSION_ID, submitDto, USER_ID, IP_ADDRESS, USER_AGENT);

      expect(mockRlsTx.engagementConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expires_at: yearEndDate,
          }),
        }),
      );
    });

    it('should set expires_at to null for standing consent', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({
          status: 'pending',
          academic_year_id: ACADEMIC_YEAR_ID,
        }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({
          form_type: 'consent_form',
          consent_type: 'standing',
          requires_signature: false,
        }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );
      mockRlsTx.engagementConsentRecord.create.mockResolvedValue({});

      await service.submit(TENANT_ID, SUBMISSION_ID, submitDto, USER_ID, IP_ADDRESS, USER_AGENT);

      expect(mockRlsTx.engagementConsentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expires_at: null,
          }),
        }),
      );
    });

    it('should reject submission when status is not pending', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );

      await expect(
        service.submit(TENANT_ID, SUBMISSION_ID, submitDto, USER_ID, IP_ADDRESS, USER_AGENT),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when signature is required but not provided', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'pending' }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({ requires_signature: true }),
      );

      await expect(
        service.submit(
          TENANT_ID,
          SUBMISSION_ID,
          { responses: {} },
          USER_ID,
          IP_ADDRESS,
          USER_AGENT,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include signature data with request metadata when signature provided', async () => {
      const signatureDto = {
        responses: { emergency_contact: 'Jane' },
        signature: {
          type: 'typed' as const,
          data: 'Jane Doe',
          timestamp: '2026-03-01T12:00:00Z',
          ip_address: '0.0.0.0',
          user_agent: 'old',
          user_id: 'will-be-overridden',
          legal_text_version: 'v1.0',
        },
      };

      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'pending' }),
      );
      mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(
        buildTemplate({ form_type: 'survey', consent_type: null, requires_signature: true }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );

      await service.submit(TENANT_ID, SUBMISSION_ID, signatureDto, USER_ID, IP_ADDRESS, USER_AGENT);

      expect(mockRlsTx.engagementFormSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            signature_json: expect.objectContaining({
              ip_address: IP_ADDRESS,
              user_agent: USER_AGENT,
              user_id: USER_ID,
              type: 'typed',
              legal_text_version: 'v1.0',
            }),
          }),
        }),
      );
    });

    it('should throw NotFoundException when submission does not exist', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, SUBMISSION_ID, submitDto, USER_ID, IP_ADDRESS, USER_AGENT),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── acknowledge ────────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should acknowledge a submitted form', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'submitted' }),
      );
      mockRlsTx.engagementFormSubmission.update.mockResolvedValue(
        buildSubmission({ status: 'acknowledged' }),
      );

      const result = (await service.acknowledge(TENANT_ID, SUBMISSION_ID, USER_ID)) as Record<
        string,
        unknown
      >;

      expect(result.status).toBe('acknowledged');
      expect(mockRlsTx.engagementFormSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SUBMISSION_ID },
          data: expect.objectContaining({
            status: 'acknowledged',
            acknowledged_by_id: USER_ID,
          }),
        }),
      );
    });

    it('should reject acknowledgement when status is not submitted', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ status: 'pending' }),
      );

      await expect(service.acknowledge(TENANT_ID, SUBMISSION_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when submission does not exist', async () => {
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(TENANT_ID, SUBMISSION_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getCompletionStats ─────────────────────────────────────────────────────

  describe('getCompletionStats', () => {
    it('should return correct status counts', async () => {
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(5) // submitted
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(2) // expired
        .mockResolvedValueOnce(17); // total

      const result = await service.getCompletionStats(TENANT_ID, {
        form_template_id: TEMPLATE_ID,
      });

      expect(result).toEqual({
        submitted: 5,
        pending: 10,
        expired: 2,
        total: 17,
      });
    });

    it('should filter by event_id when provided', async () => {
      mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

      await service.getCompletionStats(TENANT_ID, { event_id: EVENT_ID });

      // Verify that all count calls include event_id in the where clause
      const calls = mockPrisma.engagementFormSubmission.count.mock.calls;
      for (const call of calls) {
        expect(call[0].where.event_id).toBe(EVENT_ID);
      }
    });
  });

  // ─── getPendingFormsForParent ───────────────────────────────────────────────

  describe('getPendingFormsForParent', () => {
    it('should return pending forms for parent children', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { student_id: STUDENT_ID },
        { student_id: '33333333-3333-3333-3333-333333333333' },
      ]);

      const pendingForms = [
        {
          id: SUBMISSION_ID,
          form_template_id: TEMPLATE_ID,
          event_id: null,
          student_id: STUDENT_ID,
          status: 'pending',
          created_at: new Date(),
          form_template: { name: 'Trip Consent', form_type: 'consent_form' },
          student: { first_name: 'Ali', last_name: 'Hassan' },
        },
      ];
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue(pendingForms);

      const result = await service.getPendingFormsForParent(TENANT_ID, USER_ID);

      expect(result).toHaveLength(1);
      expect(mockPrisma.engagementFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: { in: [STUDENT_ID, '33333333-3333-3333-3333-333333333333'] },
            status: 'pending',
          }),
        }),
      );
    });

    it('should throw NotFoundException when parent not found', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(service.getPendingFormsForParent(TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when parent has no children', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      const result = await service.getPendingFormsForParent(TENANT_ID, USER_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.engagementFormSubmission.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getSubmissionForParent ─────────────────────────────────────────────────

  describe('getSubmissionForParent', () => {
    it('should return submission when student belongs to parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({
          student_id: STUDENT_ID,
          form_template: buildTemplate(),
          student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan' },
          consent_record: null,
        }),
      );

      const result = await service.getSubmissionForParent(TENANT_ID, SUBMISSION_ID, USER_ID);

      expect(result.id).toBe(SUBMISSION_ID);
    });

    it('should throw NotFoundException when submission student is not parent child', async () => {
      const otherStudentId = '99999999-9999-9999-9999-999999999999';

      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: otherStudentId }]);
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(
        buildSubmission({ student_id: STUDENT_ID }),
      );

      await expect(
        service.getSubmissionForParent(TENANT_ID, SUBMISSION_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when parent not found', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getSubmissionForParent(TENANT_ID, SUBMISSION_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when submission does not exist', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.engagementFormSubmission.findFirst.mockResolvedValue(null);

      await expect(
        service.getSubmissionForParent(TENANT_ID, SUBMISSION_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
