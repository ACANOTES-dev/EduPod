/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CONSENT_TYPES } from '@school/shared/gdpr';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { MOCK_FACADE_PROVIDERS, ParentReadFacade } from '../../../common/tests/mock-facades';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { ConsentService } from '../consent.service';

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

describe('ConsentService', () => {
  let service: ConsentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    mockPrisma.parent.findFirst.mockResolvedValue({
      id: PARENT_ID,
      first_name: 'Amina',
      last_name: 'Rahman',
      status: 'active',
    });
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);
    mockPrisma.application.findFirst.mockResolvedValue(null);

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

  it('should grant a new consent record', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

    const result = await service.grantConsent(
      TENANT_ID,
      'student',
      STUDENT_ID,
      CONSENT_TYPES.AI_GRADING,
      USER_ID,
      'registration_form',
    );

    expect(result).toEqual({ id: CONSENT_ID });
    expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: STUDENT_ID,
        consent_type: CONSENT_TYPES.AI_GRADING,
        status: 'granted',
        granted_by_user_id: USER_ID,
      }),
    });
    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_ID,
    });
  });

  it('should reject duplicate active consent grants', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue({ id: CONSENT_ID, status: 'granted' });

    await expect(
      service.grantConsent(
        TENANT_ID,
        'student',
        STUDENT_ID,
        CONSENT_TYPES.AI_GRADING,
        USER_ID,
        'registration_form',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should allow re-grant after withdrawal by creating a new record', async () => {
    mockPrisma.consentRecord.findFirst
      .mockResolvedValueOnce({ id: CONSENT_ID, tenant_id: TENANT_ID, status: 'granted' })
      .mockResolvedValueOnce(null);
    mockPrisma.consentRecord.update.mockResolvedValue({
      id: CONSENT_ID,
      status: 'withdrawn',
    });
    mockPrisma.consentRecord.create.mockResolvedValue({ id: 'new-consent-id', status: 'granted' });

    await service.withdrawConsent(TENANT_ID, CONSENT_ID, USER_ID);

    const regranted = await service.grantConsent(
      TENANT_ID,
      'student',
      STUDENT_ID,
      CONSENT_TYPES.AI_GRADING,
      USER_ID,
      'registration_form',
    );

    expect(regranted).toEqual({ id: 'new-consent-id', status: 'granted' });
  });

  it('should return true only when an active consent exists', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValueOnce({ id: CONSENT_ID });
    await expect(
      service.hasConsent(TENANT_ID, 'student', STUDENT_ID, CONSENT_TYPES.HEALTH_DATA),
    ).resolves.toBe(true);

    mockPrisma.consentRecord.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.hasConsent(TENANT_ID, 'student', STUDENT_ID, CONSENT_TYPES.HEALTH_DATA),
    ).resolves.toBe(false);
  });

  it('should bulk grant multiple consent records in one request', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create
      .mockResolvedValueOnce({ id: 'consent-1', consent_type: CONSENT_TYPES.HEALTH_DATA })
      .mockResolvedValueOnce({ id: 'consent-2', consent_type: CONSENT_TYPES.AI_GRADING });

    const result = await service.bulkGrantConsents(
      TENANT_ID,
      'student',
      STUDENT_ID,
      [
        {
          type: CONSENT_TYPES.HEALTH_DATA,
          evidence_type: 'registration_form',
        },
        {
          type: CONSENT_TYPES.AI_GRADING,
          evidence_type: 'registration_form',
        },
      ],
      USER_ID,
    );

    expect(result).toHaveLength(2);
    expect(mockPrisma.consentRecord.create).toHaveBeenCalledTimes(2);
  });

  it('should list parent portal consents for linked children and the parent profile', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({
      id: PARENT_ID,
      first_name: 'Amina',
      last_name: 'Rahman',
      status: 'active',
    });
    mockPrisma.studentParent.findMany.mockResolvedValue([
      {
        student: {
          id: STUDENT_ID,
          first_name: 'Layla',
          last_name: 'Rahman',
        },
      },
    ]);
    mockPrisma.consentRecord.findMany
      .mockResolvedValueOnce([
        {
          id: CONSENT_ID,
          tenant_id: TENANT_ID,
          subject_type: 'student',
          subject_id: STUDENT_ID,
          consent_type: CONSENT_TYPES.HEALTH_DATA,
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
      ])
      .mockResolvedValueOnce([
        {
          id: 'parent-consent-id',
          tenant_id: TENANT_ID,
          subject_type: 'parent',
          subject_id: PARENT_ID,
          consent_type: CONSENT_TYPES.WHATSAPP_CHANNEL,
          status: 'granted',
          granted_at: new Date('2026-03-27T11:00:00Z'),
          withdrawn_at: null,
          granted_by_user_id: USER_ID,
          evidence_type: 'registration_form',
          privacy_notice_version_id: null,
          notes: null,
          created_at: new Date('2026-03-27T11:00:00Z'),
          updated_at: new Date('2026-03-27T11:00:00Z'),
        },
      ]);

    const result = await service.getParentPortalConsents(TENANT_ID, USER_ID);

    expect(
      result.data.some(
        (item) =>
          item.subject_id === STUDENT_ID &&
          item.consent_type === CONSENT_TYPES.HEALTH_DATA &&
          item.status === 'granted',
      ),
    ).toBe(true);
    expect(
      result.data.some(
        (item) =>
          item.subject_id === PARENT_ID &&
          item.consent_type === CONSENT_TYPES.WHATSAPP_CHANNEL &&
          item.status === 'granted',
      ),
    ).toBe(true);
  });

  it('should scope getConsentsByType queries to the tenant', async () => {
    mockPrisma.consentRecord.findMany.mockResolvedValue([{ id: CONSENT_ID }]);
    mockPrisma.consentRecord.count.mockResolvedValue(1);

    await service.getConsentsByType(TENANT_ID, CONSENT_TYPES.HEALTH_DATA, {
      page: 1,
      pageSize: 20,
    });

    expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          consent_type: CONSENT_TYPES.HEALTH_DATA,
        }),
      }),
    );
  });

  it('should forbid parent withdrawal for a consent that does not belong to their child', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      subject_type: 'student',
      subject_id: STUDENT_ID,
      status: 'granted',
    });
    mockPrisma.studentParent.findFirst.mockResolvedValue(null);

    await expect(
      service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when the consent subject does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.grantConsent(
        TENANT_ID,
        'student',
        STUDENT_ID,
        CONSENT_TYPES.HEALTH_DATA,
        USER_ID,
        'registration_form',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── withdrawConsent — expanded ────────────────────────────────────────────

  it('should withdraw an active consent record and set withdrawn_at', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      status: 'granted',
    });
    mockPrisma.consentRecord.update.mockResolvedValue({
      id: CONSENT_ID,
      status: 'withdrawn',
      withdrawn_at: new Date(),
    });

    const result = await service.withdrawConsent(TENANT_ID, CONSENT_ID, USER_ID);

    expect(result).toEqual(expect.objectContaining({ id: CONSENT_ID, status: 'withdrawn' }));
    expect(mockPrisma.consentRecord.update).toHaveBeenCalledWith({
      where: { id: CONSENT_ID },
      data: {
        status: 'withdrawn',
        withdrawn_at: expect.any(Date),
      },
    });
  });

  it('should throw NotFoundException when withdrawing a consent that does not exist', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);

    await expect(service.withdrawConsent(TENANT_ID, CONSENT_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('edge: should throw BadRequestException when withdrawing an already-withdrawn consent', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      status: 'withdrawn',
    });

    await expect(service.withdrawConsent(TENANT_ID, CONSENT_ID, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ─── grantConsent — optional fields ────────────────────────────────────────

  it('should store notes and privacy_notice_version_id when provided', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

    await service.grantConsent(
      TENANT_ID,
      'student',
      STUDENT_ID,
      CONSENT_TYPES.AI_GRADING,
      USER_ID,
      'registration_form',
      'Parent signed paper form',
      'privacy-version-1',
    );

    expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notes: 'Parent signed paper form',
        privacy_notice_version_id: 'privacy-version-1',
      }),
    });
  });

  it('should set notes and privacy_notice_version_id to null when not provided', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

    await service.grantConsent(
      TENANT_ID,
      'student',
      STUDENT_ID,
      CONSENT_TYPES.AI_GRADING,
      USER_ID,
      'registration_form',
    );

    expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notes: null,
        privacy_notice_version_id: null,
      }),
    });
  });

  // ─── hasConsent — query verification ───────────────────────────────────────

  it('should query hasConsent with status=granted filter', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);

    await service.hasConsent(TENANT_ID, 'student', STUDENT_ID, CONSENT_TYPES.AI_GRADING);

    expect(mockPrisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: STUDENT_ID,
        consent_type: CONSENT_TYPES.AI_GRADING,
        status: 'granted',
      },
      select: { id: true },
    });
  });

  // ─── getConsentsForSubject — expanded ──────────────────────────────────────

  it('should return all consent records for a subject ordered by granted_at desc', async () => {
    const records = [
      { id: CONSENT_ID, consent_type: CONSENT_TYPES.HEALTH_DATA, status: 'granted' },
      { id: 'old-consent', consent_type: CONSENT_TYPES.AI_GRADING, status: 'withdrawn' },
    ];
    mockPrisma.consentRecord.findMany.mockResolvedValue(records);

    const result = await service.getConsentsForSubject(TENANT_ID, 'student', STUDENT_ID);

    expect(result).toEqual(records);
    expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        subject_type: 'student',
        subject_id: STUDENT_ID,
      },
      orderBy: [{ granted_at: 'desc' }, { created_at: 'desc' }],
    });
  });

  it('should throw NotFoundException on getConsentsForSubject when subject does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.getConsentsForSubject(TENANT_ID, 'student', STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── getConsentsByType — pagination ────────────────────────────────────────

  it('should paginate getConsentsByType correctly for page 2', async () => {
    mockPrisma.consentRecord.findMany.mockResolvedValue([]);
    mockPrisma.consentRecord.count.mockResolvedValue(30);

    const result = await service.getConsentsByType(TENANT_ID, CONSENT_TYPES.AI_GRADING, {
      page: 2,
      pageSize: 10,
    });

    expect(mockPrisma.consentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 30 });
  });

  // ─── bulkGrantConsents — already active ────────────────────────────────────

  it('should throw BadRequestException in bulkGrant if any consent is already active', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue({ id: CONSENT_ID, status: 'granted' });

    await expect(
      service.bulkGrantConsents(
        TENANT_ID,
        'student',
        STUDENT_ID,
        [{ type: CONSENT_TYPES.HEALTH_DATA, evidence_type: 'registration_form' }],
        USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── getParentPortalConsents — expanded ────────────────────────────────────

  it('should throw NotFoundException on getParentPortalConsents when parent not found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    await expect(service.getParentPortalConsents(TENANT_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return items with status=withdrawn and consent_id=null when no records exist', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({
      id: PARENT_ID,
      first_name: 'Amina',
      last_name: 'Rahman',
      status: 'active',
    });
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { student: { id: STUDENT_ID, first_name: 'Layla', last_name: 'Rahman' } },
    ]);
    mockPrisma.consentRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await service.getParentPortalConsents(TENANT_ID, USER_ID);

    for (const item of result.data) {
      expect(item.status).toBe('withdrawn');
      expect(item.consent_id).toBeNull();
    }
  });

  it('should handle parent with no linked students', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({
      id: PARENT_ID,
      first_name: 'Amina',
      last_name: 'Rahman',
      status: 'active',
    });
    mockPrisma.studentParent.findMany.mockResolvedValue([]);
    mockPrisma.consentRecord.findMany.mockResolvedValue([]);

    const result = await service.getParentPortalConsents(TENANT_ID, USER_ID);

    expect(result.data.length).toBeGreaterThan(0);
    for (const item of result.data) {
      expect(item.subject_type).toBe('parent');
    }
  });

  // ─── withdrawParentPortalConsent — expanded ────────────────────────────────

  it('should allow parent to withdraw their own consent', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      subject_type: 'parent',
      subject_id: PARENT_ID,
      status: 'granted',
    });
    mockPrisma.consentRecord.update.mockResolvedValue({ id: CONSENT_ID, status: 'withdrawn' });

    const result = await service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID);

    expect(result).toEqual(expect.objectContaining({ id: CONSENT_ID, status: 'withdrawn' }));
  });

  it('should allow parent to withdraw consent for their linked child', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      subject_type: 'student',
      subject_id: STUDENT_ID,
      status: 'granted',
    });
    mockPrisma.studentParent.findFirst.mockResolvedValue({ student_id: STUDENT_ID });
    mockPrisma.consentRecord.update.mockResolvedValue({ id: CONSENT_ID, status: 'withdrawn' });

    const result = await service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID);

    expect(result).toEqual(expect.objectContaining({ id: CONSENT_ID, status: 'withdrawn' }));
  });

  it('should throw NotFoundException on withdrawParentPortalConsent when parent not found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    await expect(
      service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException on withdrawParentPortalConsent when consent not found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException for non-student, non-parent subject types', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, status: 'active' });
    mockPrisma.consentRecord.findFirst.mockResolvedValue({
      id: CONSENT_ID,
      tenant_id: TENANT_ID,
      subject_type: 'staff',
      subject_id: 'staff-id',
      status: 'granted',
    });

    await expect(
      service.withdrawParentPortalConsent(TENANT_ID, USER_ID, CONSENT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Subject type validation ───────────────────────────────────────────────

  it('should validate staff subjects exist via staffProfile lookup', async () => {
    const STAFF_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

    await service.grantConsent(
      TENANT_ID,
      'staff',
      STAFF_ID,
      CONSENT_TYPES.AI_GRADING,
      USER_ID,
      'registration_form',
    );

    expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith({
      where: { id: STAFF_ID, tenant_id: TENANT_ID },
      select: { id: true },
    });
  });

  it('should validate applicant subjects exist via application lookup', async () => {
    const APPLICANT_ID = '11111111-1111-1111-1111-111111111111';
    mockPrisma.application.findFirst.mockResolvedValue({ id: APPLICANT_ID });
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    mockPrisma.consentRecord.create.mockResolvedValue({ id: CONSENT_ID });

    await service.grantConsent(
      TENANT_ID,
      'applicant',
      APPLICANT_ID,
      CONSENT_TYPES.HEALTH_DATA,
      USER_ID,
      'registration_form',
    );

    expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
      where: { id: APPLICANT_ID, tenant_id: TENANT_ID },
      select: { id: true },
    });
  });
});
