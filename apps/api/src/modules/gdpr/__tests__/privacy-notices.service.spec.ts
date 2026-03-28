/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

import { PrivacyNoticesService } from '../privacy-notices.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildMockPrisma() {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
    privacyNoticeVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    privacyNoticeAcknowledgement: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tenantMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('PrivacyNoticesService', () => {
  let service: PrivacyNoticesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockNotifications: { createBatch: jest.Mock };
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockNotifications = {
      createBatch: jest.fn(),
    };

    mockCreateRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) => fn(mockPrisma),
      ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyNoticesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<PrivacyNoticesService>(PrivacyNoticesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should scope privacy notice lists to the tenant and expose acknowledgement counts', async () => {
    mockPrisma.privacyNoticeVersion.findMany.mockResolvedValue([
      {
        id: 'version-id',
        tenant_id: TENANT_ID,
        version_number: 3,
        content_html: '<p>Notice</p>',
        content_html_ar: null,
        effective_date: new Date('2026-03-27'),
        published_at: new Date('2026-03-27T10:00:00Z'),
        created_by_user_id: USER_ID,
        created_at: new Date('2026-03-26T10:00:00Z'),
        _count: {
          acknowledgements: 42,
        },
      },
    ]);

    const result = await service.listVersions(TENANT_ID);

    expect(mockPrisma.privacyNoticeVersion.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      orderBy: [{ version_number: 'desc' }],
      include: {
        _count: {
          select: { acknowledgements: true },
        },
      },
    });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          version_number: 3,
          acknowledgement_count: 42,
        }),
      ],
    });
  });

  it('should require re-acknowledgement when a newer published version exists', async () => {
    mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
      id: 'current-version-id',
      tenant_id: TENANT_ID,
      version_number: 2,
      content_html: '<p>Updated notice</p>',
      content_html_ar: null,
      effective_date: new Date('2026-04-01'),
      published_at: new Date('2026-04-01T09:00:00Z'),
      created_by_user_id: USER_ID,
      created_at: new Date('2026-03-31T09:00:00Z'),
    });
    mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);

    const result = await service.getCurrentForUser(TENANT_ID, USER_ID);

    expect(result.requires_acknowledgement).toBe(true);
    expect(result.acknowledged).toBe(false);
    expect(result.current_version?.version_number).toBe(2);
  });

  it('should create an acknowledgement record for the current published version', async () => {
    mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
      id: 'current-version-id',
      tenant_id: TENANT_ID,
      version_number: 2,
      content_html: '<p>Updated notice</p>',
      content_html_ar: null,
      effective_date: new Date('2026-04-01'),
      published_at: new Date('2026-04-01T09:00:00Z'),
      created_by_user_id: USER_ID,
      created_at: new Date('2026-03-31T09:00:00Z'),
    });
    mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);
    mockPrisma.privacyNoticeAcknowledgement.create.mockResolvedValue({
      id: 'ack-id',
    });

    const result = await service.acknowledgeCurrentVersion(TENANT_ID, USER_ID, '127.0.0.1');

    expect(result).toEqual({ id: 'ack-id' });
    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    expect(mockPrisma.privacyNoticeAcknowledgement.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        privacy_notice_version_id: 'current-version-id',
        ip_address: '127.0.0.1',
      },
    });
  });

  it('should notify active tenant users when a version is published', async () => {
    mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
      id: 'version-id',
      tenant_id: TENANT_ID,
      version_number: 4,
      content_html: '<p>Notice</p>',
      content_html_ar: null,
      effective_date: new Date('2026-04-05'),
      published_at: null,
      created_by_user_id: USER_ID,
      created_at: new Date('2026-04-04T10:00:00Z'),
    });
    mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
      id: 'version-id',
      version_number: 4,
      published_at: new Date('2026-04-05T08:00:00Z'),
    });
    mockPrisma.tenantMembership.findMany.mockResolvedValue([
      {
        user_id: USER_ID,
        user: {
          preferred_locale: 'en',
        },
      },
    ]);

    await service.publishVersion(TENANT_ID, 'version-id');

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      [
        expect.objectContaining({
          recipient_user_id: USER_ID,
          template_key: 'legal.privacy_notice_published',
          payload_json: expect.objectContaining({
            version_number: 4,
          }),
        }),
      ],
    );
  });
});
