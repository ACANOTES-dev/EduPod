import { PrismaClient } from '@prisma/client';

import {
  EapRefreshCheckProcessor,
  EAP_REFRESH_CHECK_JOB,
} from './eap-refresh-check.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERMISSION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ROLE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const MEMBERSHIP_ID_1 = '11111111-1111-1111-1111-111111111111';
const MEMBERSHIP_ID_2 = '22222222-2222-2222-2222-222222222222';

// ─── Time fixtures ──────────────────────────────────────────────────────────

const now = new Date('2026-03-27T08:00:00Z');
const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

// ─── Mock builder ────────────────────────────────────────────────────────────

interface MockOverrides {
  tenantModuleFindMany?: jest.Mock;
  tenantSettingFindUnique?: jest.Mock;
  permissionFindFirst?: jest.Mock;
  rolePermissionFindMany?: jest.Mock;
  membershipRoleFindMany?: jest.Mock;
  tenantMembershipFindMany?: jest.Mock;
  notificationCreateMany?: jest.Mock;
}

function buildMockPrisma(overrides: MockOverrides = {}) {
  const tenantModuleFindMany =
    overrides.tenantModuleFindMany ??
    jest.fn().mockResolvedValue([{ tenant_id: TENANT_ID }]);

  const tenantSettingFindUnique =
    overrides.tenantSettingFindUnique ??
    jest.fn().mockResolvedValue({
      settings: {
        staff_wellbeing: {
          eap_last_verified_date: ninetyOneDaysAgo,
        },
      },
    });

  const permissionFindFirst =
    overrides.permissionFindFirst ??
    jest.fn().mockResolvedValue({ id: PERMISSION_ID });

  const rolePermissionFindMany =
    overrides.rolePermissionFindMany ??
    jest.fn().mockResolvedValue([{ role_id: ROLE_ID }]);

  const membershipRoleFindMany =
    overrides.membershipRoleFindMany ??
    jest.fn().mockResolvedValue([{ membership_id: MEMBERSHIP_ID_1 }]);

  const tenantMembershipFindMany =
    overrides.tenantMembershipFindMany ??
    jest.fn().mockResolvedValue([{ user_id: USER_ID_1 }]);

  const notificationCreateMany =
    overrides.notificationCreateMany ?? jest.fn().mockResolvedValue({ count: 1 });

  const mockClient = {
    tenantModule: { findMany: tenantModuleFindMany },
    tenantSetting: { findUnique: tenantSettingFindUnique },
    permission: { findFirst: permissionFindFirst },
    rolePermission: { findMany: rolePermissionFindMany },
    membershipRole: { findMany: membershipRoleFindMany },
    tenantMembership: { findMany: tenantMembershipFindMany },
    notification: { createMany: notificationCreateMany },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  } as unknown as PrismaClient;

  (mockClient.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockClient),
  );

  return {
    mockClient,
    tenantModuleFindMany,
    tenantSettingFindUnique,
    permissionFindFirst,
    rolePermissionFindMany,
    membershipRoleFindMany,
    tenantMembershipFindMany,
    notificationCreateMany,
  };
}

function buildJob(name: string = EAP_REFRESH_CHECK_JOB) {
  return { name, data: {} };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('EapRefreshCheckProcessor', () => {
  let processor: EapRefreshCheckProcessor;
  let realDateNow: () => number;

  beforeAll(() => {
    realDateNow = Date.now;
    Date.now = () => now.getTime();
  });

  afterAll(() => {
    Date.now = realDateNow;
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Notification sent when eap_last_verified_date > 90 days ago ──────

  it('should send notifications when eap_last_verified_date is more than 90 days ago', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantSettingFindUnique: jest.fn().mockResolvedValue({
        settings: {
          staff_wellbeing: {
            eap_last_verified_date: ninetyOneDaysAgo,
          },
        },
      }),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID_1,
            channel: 'in_app',
            source_entity_type: 'tenant_settings',
            payload_json: expect.objectContaining({
              title: 'EAP Details Review',
              body: "It's been a while — please verify your EAP provider details are current.",
              link: '/settings/wellbeing',
            }),
          }),
        ]),
      }),
    );
  });

  // ─── Notification sent when eap_last_verified_date is null ───────────

  it('should send notifications when eap_last_verified_date is null', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantSettingFindUnique: jest.fn().mockResolvedValue({
        settings: {
          staff_wellbeing: {
            eap_last_verified_date: null,
          },
        },
      }),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).toHaveBeenCalled();
  });

  it('should send notifications when tenant settings have no staff_wellbeing key', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantSettingFindUnique: jest.fn().mockResolvedValue({
        settings: {},
      }),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).toHaveBeenCalled();
  });

  it('should send notifications when tenantSetting record does not exist', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantSettingFindUnique: jest.fn().mockResolvedValue(null),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).toHaveBeenCalled();
  });

  // ─── No notification when eap_last_verified_date < 90 days ago ───────

  it('should not send notifications when eap_last_verified_date is within 90 days', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantSettingFindUnique: jest.fn().mockResolvedValue({
        settings: {
          staff_wellbeing: {
            eap_last_verified_date: thirtyDaysAgo,
          },
        },
      }),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  // ─── Module disabled → tenant skipped ────────────────────────────────

  it('should skip tenants where staff_wellbeing module is disabled', async () => {
    const { mockClient, notificationCreateMany, tenantSettingFindUnique } =
      buildMockPrisma({
        tenantModuleFindMany: jest.fn().mockResolvedValue([]),
      });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(tenantSettingFindUnique).not.toHaveBeenCalled();
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it('should only process tenants with is_enabled = true', async () => {
    // tenantModuleFindMany is called with where.is_enabled = true;
    // verify the query filter is correct
    const { mockClient, tenantModuleFindMany } = buildMockPrisma({
      tenantModuleFindMany: jest.fn().mockResolvedValue([]),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(tenantModuleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          module_key: 'staff_wellbeing',
          is_enabled: true,
        }),
      }),
    );
  });

  // ─── No users with permission → no notifications ──────────────────────

  it('should not create notifications when no users have wellbeing.manage_resources permission', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      tenantMembershipFindMany: jest.fn().mockResolvedValue([]),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it('should not create notifications when the permission key does not exist', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      permissionFindFirst: jest.fn().mockResolvedValue(null),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it('should not create notifications when no roles carry the permission', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      rolePermissionFindMany: jest.fn().mockResolvedValue([]),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  // ─── Multiple users receive notifications ────────────────────────────

  it('should create one notification per eligible user', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      membershipRoleFindMany: jest.fn().mockResolvedValue([
        { membership_id: MEMBERSHIP_ID_1 },
        { membership_id: MEMBERSHIP_ID_2 },
      ]),
      tenantMembershipFindMany: jest.fn().mockResolvedValue([
        { user_id: USER_ID_1 },
        { user_id: USER_ID_2 },
      ]),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(notificationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ recipient_user_id: USER_ID_1 }),
          expect.objectContaining({ recipient_user_id: USER_ID_2 }),
        ]),
      }),
    );

    const callArg = (notificationCreateMany as jest.Mock).mock.calls[0][0] as {
      data: unknown[];
    };
    expect(callArg.data).toHaveLength(2);
  });

  // ─── Deduplication of users ──────────────────────────────────────────

  it('should deduplicate users who hold the permission through multiple roles', async () => {
    const { mockClient, notificationCreateMany } = buildMockPrisma({
      membershipRoleFindMany: jest.fn().mockResolvedValue([
        { membership_id: MEMBERSHIP_ID_1 },
        { membership_id: MEMBERSHIP_ID_2 },
      ]),
      // Both memberships resolve to the same user
      tenantMembershipFindMany: jest.fn().mockResolvedValue([
        { user_id: USER_ID_1 },
        { user_id: USER_ID_1 },
      ]),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    const callArg = (notificationCreateMany as jest.Mock).mock.calls[0][0] as {
      data: unknown[];
    };
    // Deduplication ensures only one notification per user
    expect(callArg.data).toHaveLength(1);
  });

  // ─── RLS context set per tenant ──────────────────────────────────────

  it('should set RLS context per tenant transaction', async () => {
    const { mockClient } = buildMockPrisma({
      tenantModuleFindMany: jest.fn().mockResolvedValue([
        { tenant_id: TENANT_ID },
        { tenant_id: TENANT_ID_B },
      ]),
      tenantSettingFindUnique: jest.fn().mockResolvedValue({
        settings: {
          staff_wellbeing: { eap_last_verified_date: ninetyOneDaysAgo },
        },
      }),
    });

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob() as never);

    // One transaction per tenant
    expect(mockClient.$transaction).toHaveBeenCalledTimes(2);
    // RLS set within each transaction
    expect(mockClient.$executeRaw).toHaveBeenCalledTimes(2);
  });

  // ─── Job name guard ───────────────────────────────────────────────────

  it('should ignore jobs with a non-matching name', async () => {
    const { mockClient, tenantModuleFindMany } = buildMockPrisma({});

    processor = new EapRefreshCheckProcessor(mockClient);

    await processor.process(buildJob('some-other-job') as never);

    expect(tenantModuleFindMany).not.toHaveBeenCalled();
  });
});
