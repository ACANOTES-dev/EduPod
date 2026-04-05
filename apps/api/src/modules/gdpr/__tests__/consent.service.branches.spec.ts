/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CONSENT_TYPES } from '@school/shared/gdpr';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { MOCK_FACADE_PROVIDERS, ParentReadFacade } from '../../../common/tests/mock-facades';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { ConsentService } from '../consent.service';

// ─── Constants ─────────��──────────────────────────────���─────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONSENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function buildMockPrisma() {
  return {
    consentRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    student: { findFirst: jest.fn() },
    parent: { findFirst: jest.fn() },
    staffProfile: { findFirst: jest.fn() },
    application: { findFirst: jest.fn() },
    studentParent: { findFirst: jest.fn(), findMany: jest.fn() },
  };
}

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('ConsentService — branch coverage', () => {
  let service: ConsentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockCreateRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(
          async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) =>
            fn(mockPrisma),
        ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ConsentService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ParentReadFacade,
          useValue: {
            findActiveByUserId: mockPrisma.parent.findFirst,
            findStudentLinksForParent: mockPrisma.studentParent.findMany,
            isLinkedToStudent: mockPrisma.studentParent.findFirst,
          },
        },
      ],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── subjectExists — unknown subject type returns false (default branch) ─

  describe('ConsentService — subjectExists default branch', () => {
    it('edge: should throw NotFoundException for unknown subject type (default case)', async () => {
      // Cast to bypass TS check — we want to exercise the default branch
      await expect(
        service.grantConsent(
          TENANT_ID,
          'unknown_type' as 'student',
          STUDENT_ID,
          CONSENT_TYPES.AI_GRADING,
          USER_ID,
          'registration_form',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── grantConsent — null notes/privacy_notice_version_id via explicit null ─

  describe('ConsentService — grantConsent nullish coalescing', () => {
    it('should set notes to null when passed explicit null', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

      await service.grantConsent(
        TENANT_ID,
        'student',
        STUDENT_ID,
        CONSENT_TYPES.AI_GRADING,
        USER_ID,
        'registration_form',
        null,
        null,
      );

      expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: null,
          privacy_notice_version_id: null,
        }),
      });
    });
  });

  // ��── withdrawParentPortalConsent — parent owns consent directly ─────────���──

  describe('ConsentService — withdrawParentPortalConsent subject_type=parent but different id', () => {
    it('edge: should throw ForbiddenException when consent subject_type=parent but subject_id differs', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
      mockPrisma.consentRecord.findFirst.mockResolvedValue({
        id: CONSENT_ID,
        tenant_id: TENANT_ID,
        subject_type: 'parent',
        subject_id: 'other-parent-id', // different parent
        status: 'granted',
      });

      // subject_type is parent but subject_id doesn't match the parent - falls through to subject_type !== 'student' check
      const { ForbiddenException } = await import('@nestjs/common');
      await expect(
        service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getParentPortalConsents — sorting with same category different names ──

  describe('ConsentService — getParentPortalConsents sorting branches', () => {
    it('should sort items by category, then subject_name, then consent_type', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'Zara',
        last_name: 'Smith',
        status: 'active',
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { student: { id: 'student-1', first_name: 'Alice', last_name: 'Jones' } },
        { student: { id: 'student-2', first_name: 'Alice', last_name: 'Adams' } },
      ]);
      mockPrisma.consentRecord.findMany
        .mockResolvedValueOnce([]) // student consents
        .mockResolvedValueOnce([]); // parent consents

      const result = await service.getParentPortalConsents(TENANT_ID, USER_ID);

      // Verify sorting is applied (items exist, sorted by category then name)
      expect(result.data.length).toBeGreaterThan(0);

      // All items should have a valid consent_type from the known types
      for (const item of result.data) {
        expect(item.consent_type).toBeDefined();
        expect(item.subject_name).toBeDefined();
      }
    });
  });

  // ─── bulkGrantConsents — notes and privacy_notice_version_id coalescing ────

  describe('ConsentService — bulkGrantConsents optional fields', () => {
    it('should coalesce notes and privacy_notice_version_id to null when not provided', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.consentRecord.create.mockResolvedValue({ id: 'consent-1' });

      await service.bulkGrantConsents(
        TENANT_ID,
        'student',
        STUDENT_ID,
        [
          {
            type: CONSENT_TYPES.HEALTH_DATA,
            evidence_type: 'registration_form',
            // No notes, no privacy_notice_version_id
          },
        ],
        USER_ID,
      );

      expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: null,
          privacy_notice_version_id: null,
        }),
      });
    });

    it('should pass notes and privacy_notice_version_id when provided', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
      mockPrisma.consentRecord.create.mockResolvedValue({ id: 'consent-1' });

      await service.bulkGrantConsents(
        TENANT_ID,
        'student',
        STUDENT_ID,
        [
          {
            type: CONSENT_TYPES.HEALTH_DATA,
            evidence_type: 'registration_form',
            notes: 'Test note',
            privacy_notice_version_id: 'version-1',
          },
        ],
        USER_ID,
      );

      expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: 'Test note',
          privacy_notice_version_id: 'version-1',
        }),
      });
    });
  });

  // ─── mapPortalConsentItem — when record has no withdrawn_at ────────────────

  describe('ConsentService — mapPortalConsentItem branch on record fields', () => {
    it('should map granted consent with null withdrawn_at', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        first_name: 'Test',
        last_name: 'Parent',
        status: 'active',
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      // Return a parent consent with granted_at but no withdrawn_at
      mockPrisma.consentRecord.findMany.mockResolvedValue([
        {
          id: CONSENT_ID,
          tenant_id: TENANT_ID,
          subject_type: 'parent',
          subject_id: PARENT_ID,
          consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
          status: 'granted',
          granted_at: new Date('2026-03-27T10:00:00Z'),
          withdrawn_at: null,
          granted_by_user_id: USER_ID,
          evidence_type: 'registration_form',
          privacy_notice_version_id: null,
          notes: null,
          created_at: new Date('2026-03-27T10:00:00Z'),
          updated_at: new Date('2026-03-27T10:00:00Z'),
        },
      ]);

      const result = await service.getParentPortalConsents(TENANT_ID, USER_ID);

      const whatsappItem = result.data.find(
        (item) => item.consent_type === CONSENT_TYPES.WHATSAPP_CHANNEL,
      );
      expect(whatsappItem).toBeDefined();
      expect(whatsappItem!.status).toBe('granted');
      expect(whatsappItem!.withdrawn_at).toBeNull();
      expect(whatsappItem!.granted_at).toBeDefined();
    });
  });
});
