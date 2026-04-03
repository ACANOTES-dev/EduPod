/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Test, TestingModule } from '@nestjs/testing';

import { CONSENT_TYPES } from '@school/shared/gdpr';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';

import { ApplicationStateMachineService } from './application-state-machine.service';

// Mock RLS middleware completely
jest.mock('../../common/middleware/rls.middleware');

describe('ApplicationStateMachineService', () => {
  let service: ApplicationStateMachineService;
  let mockPrisma: { $transaction: jest.Mock };
  let mockApprovalRequestsService: { checkAndCreateIfNeeded: jest.Mock };
  let mockSearchIndexService: { indexEntity: jest.Mock };
  let mockRlsTx: Record<string, any>;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const PARENT_ID = 'parent-1';
  const APPLICATION_ID = 'app-1';

  beforeEach(async () => {
    mockRlsTx = {
      application: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
      },
      parent: {
        findFirst: jest.fn().mockResolvedValue({ id: PARENT_ID }),
      },
      applicationNote: {
        create: jest.fn(),
      },
      consentRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
      },
      tenantSetting: {
        findFirst: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockRlsTx);
      }),
    };

    const mockCreateRlsClient = createRlsClient as jest.Mock;
    mockCreateRlsClient.mockReturnValue(mockPrisma);

    mockApprovalRequestsService = {
      checkAndCreateIfNeeded: jest.fn(),
    };

    mockSearchIndexService = {
      indexEntity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationStateMachineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
      ],
    }).compile();

    service = module.get<ApplicationStateMachineService>(ApplicationStateMachineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submit', () => {
    it('should throw NotFoundException if application does not exist', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue(null);

      await expect(service.submit(TENANT_ID, APPLICATION_ID, USER_ID)).rejects.toMatchObject({
        response: {
          error: { code: 'APPLICATION_NOT_FOUND' },
        },
      });
    });

    it('should throw BadRequestException if application is not in draft state', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({ status: 'submitted' });

      await expect(service.submit(TENANT_ID, APPLICATION_ID, USER_ID)).rejects.toMatchObject({
        response: {
          error: { code: 'INVALID_STATUS_TRANSITION' },
        },
      });
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        status: 'draft',
        submitted_by_parent_id: 'other-parent-id',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

      await expect(service.submit(TENANT_ID, APPLICATION_ID, USER_ID)).rejects.toMatchObject({
        response: {
          error: { code: 'NOT_APPLICATION_OWNER' },
        },
      });
    });

    it('should flag duplicates if matching name and DOB exists', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        status: 'draft',
        submitted_by_parent_id: PARENT_ID,
        student_first_name: 'John',
        student_last_name: 'Doe',
        date_of_birth: new Date(),
        payload_json: {},
      });

      mockRlsTx.application.findMany.mockResolvedValue([{ application_number: 'APP-123' }]);

      mockRlsTx.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        application_number: 'APP-124',
        student_first_name: 'John',
        student_last_name: 'Doe',
        status: 'submitted',
      });

      await service.submit(TENANT_ID, APPLICATION_ID, USER_ID);

      expect(mockRlsTx.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_internal: true,
            note: expect.stringContaining('Potential duplicate detected'),
          }),
        }),
      );
    });

    it('should extract and save consents from payload on submit', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        status: 'draft',
        submitted_by_parent_id: PARENT_ID,
        payload_json: {
          __consents: {
            photo_use: true,
            whatsapp_channel: true,
          },
        },
      });

      mockRlsTx.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        application_number: 'APP-100',
        status: 'submitted',
      });

      await service.submit(TENANT_ID, APPLICATION_ID, USER_ID);

      // Should save standard consents for applicant
      expect(mockRlsTx.consentRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ consent_type: CONSENT_TYPES.PHOTO_USE }),
          ]),
        }),
      );

      // Should save whatsapp consent for parent
      expect(mockRlsTx.consentRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
            subject_type: 'parent',
          }),
        }),
      );

      // Should index the application
      expect(mockSearchIndexService.indexEntity).toHaveBeenCalled();
    });
  });

  describe('review', () => {
    const TIMESTAMP = new Date().toISOString();

    it('should throw NotFoundException if missing', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue(null);
      await expect(
        service.review(
          TENANT_ID,
          APPLICATION_ID,
          { status: 'rejected', rejection_reason: 'no', expected_updated_at: TIMESTAMP },
          USER_ID,
        ),
      ).rejects.toMatchObject({ response: { error: { code: 'APPLICATION_NOT_FOUND' } } });
    });

    it('should throw BadRequestException on concurrent modification', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date('2025-01-01T00:00:00Z'),
      });
      await expect(
        service.review(
          TENANT_ID,
          APPLICATION_ID,
          { status: 'rejected', rejection_reason: 'no', expected_updated_at: TIMESTAMP },
          USER_ID,
        ),
      ).rejects.toMatchObject({ response: { error: { code: 'CONCURRENT_MODIFICATION' } } });
    });

    it('should throw BadRequestException for invalid transitions', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date(TIMESTAMP),
        status: 'withdrawn', // withdrawn -> anything is invalid
      });
      await expect(
        service.review(
          TENANT_ID,
          APPLICATION_ID,
          { status: 'rejected', expected_updated_at: TIMESTAMP },
          USER_ID,
        ),
      ).rejects.toMatchObject({ response: { error: { code: 'INVALID_STATUS_TRANSITION' } } });
    });

    it('should require rejection reason', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date(TIMESTAMP),
        status: 'submitted',
      });
      await expect(
        service.review(
          TENANT_ID,
          APPLICATION_ID,
          { status: 'rejected', expected_updated_at: TIMESTAMP },
          USER_ID,
        ),
      ).rejects.toMatchObject({ response: { error: { code: 'REJECTION_REASON_REQUIRED' } } });
    });

    it('should reject application properly and create a note', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date(TIMESTAMP),
        status: 'submitted',
      });

      await service.review(
        TENANT_ID,
        APPLICATION_ID,
        { status: 'rejected', rejection_reason: 'Declined', expected_updated_at: TIMESTAMP },
        USER_ID,
      );

      expect(mockRlsTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'rejected', rejection_reason: 'Declined' }),
        }),
      );
      expect(mockRlsTx.applicationNote.create).toHaveBeenCalled();
    });

    it('should request approval if required by tenant settings for acceptance', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date(TIMESTAMP),
        status: 'under_review',
      });
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: true } },
      });
      mockApprovalRequestsService['checkAndCreateIfNeeded'].mockResolvedValue({
        approved: false,
        request_id: 'req-1',
      });

      const res = (await service.review(
        TENANT_ID,
        APPLICATION_ID,
        { status: 'pending_acceptance_approval', expected_updated_at: TIMESTAMP },
        USER_ID,
      )) as any;

      expect(res.approval_required).toBe(true);
      expect(mockRlsTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'pending_acceptance_approval' }),
        }),
      );
    });

    it('should auto-accept if approval is not required', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        updated_at: new Date(TIMESTAMP),
        status: 'under_review',
      });
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { admissions: { requireApprovalForAcceptance: false } },
      });

      await service.review(
        TENANT_ID,
        APPLICATION_ID,
        { status: 'pending_acceptance_approval', expected_updated_at: TIMESTAMP },
        USER_ID,
      );

      expect(mockApprovalRequestsService['checkAndCreateIfNeeded']).not.toHaveBeenCalled();
      expect(mockRlsTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'accepted' }) }),
      );
    });
  });

  describe('withdraw', () => {
    it('should allow parent to withdraw their own application', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        status: 'draft',
        submitted_by_parent_id: PARENT_ID,
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

      await service.withdraw(TENANT_ID, APPLICATION_ID, USER_ID, true);

      expect(mockRlsTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'withdrawn' }) }),
      );
    });

    it('should reject parent withdrawing someone else application', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        status: 'draft',
        submitted_by_parent_id: 'different-parent',
      });
      mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

      await expect(
        service.withdraw(TENANT_ID, APPLICATION_ID, USER_ID, true),
      ).rejects.toMatchObject({ response: { error: { code: 'NOT_OWNER' } } });
    });

    it('should block withdrawal from invalid states', async () => {
      mockRlsTx.application.findFirst.mockResolvedValue({
        id: APPLICATION_ID,
        status: 'rejected',
      });

      await expect(
        service.withdraw(TENANT_ID, APPLICATION_ID, USER_ID, false),
      ).rejects.toMatchObject({ response: { error: { code: 'INVALID_STATUS_TRANSITION' } } });
    });
  });
});
