import { PrismaClient } from '@prisma/client';

import {
  BREAK_GLASS_EXPIRY_JOB,
  BreakGlassExpiryProcessor,
} from './break-glass-expiry.processor';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GRANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GRANTED_BY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const GRANTED_TO_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    safeguardingBreakGlassGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    behaviourTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildExpiredGrant(overrides?: Record<string, unknown>) {
  return {
    id: GRANT_ID,
    tenant_id: TENANT_ID,
    granted_by_id: GRANTED_BY_ID,
    granted_to_id: GRANTED_TO_ID,
    expires_at: new Date('2026-01-01T00:00:00.000Z'),
    revoked_at: null,
    ...overrides,
  };
}

function buildJob(name: string) {
  return {
    name,
    data: { tenant_id: TENANT_ID },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BreakGlassExpiryProcessor', () => {
  let processor: BreakGlassExpiryProcessor;
  let mockTx: ReturnType<typeof buildMockTx>;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new BreakGlassExpiryProcessor(mockPrisma);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────────

  it('should ignore jobs with a different name', async () => {
    await processor.process(buildJob('behaviour:some-other-job') as never);

    expect(mockTx.safeguardingBreakGlassGrant.findMany).not.toHaveBeenCalled();
  });

  it('should throw if tenant_id is missing', async () => {
    const badJob = { name: BREAK_GLASS_EXPIRY_JOB, data: {} };

    await expect(processor.process(badJob as never)).rejects.toThrow(
      'missing tenant_id',
    );
  });

  // ─── No expired grants ──────────────────────────────────────────────────────

  it('should do nothing when there are no expired grants', async () => {
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    expect(mockTx.safeguardingBreakGlassGrant.updateMany).not.toHaveBeenCalled();
    expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  // ─── Expired grant processing ────────────────────────────────────────────────

  it('should revoke an expired grant atomically', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    expect(mockTx.safeguardingBreakGlassGrant.updateMany).toHaveBeenCalledWith({
      where: { id: GRANT_ID, revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('should create a break_glass_review task assigned to the granter', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    expect(mockTx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        task_type: 'break_glass_review',
        entity_type: 'break_glass_grant',
        entity_id: GRANT_ID,
        priority: 'high',
        status: 'pending',
        assigned_to_id: GRANTED_BY_ID,
        created_by_id: GRANTED_BY_ID,
      }),
    });
  });

  it('should set task due_date to 7 days from now', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    const before = Date.now();
    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);
    const after = Date.now();

    const callArg = mockTx.behaviourTask.create.mock.calls[0][0] as {
      data: { due_date: Date };
    };
    const dueDate = callArg.data.due_date.getTime();

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(dueDate).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(dueDate).toBeLessThanOrEqual(after + sevenDaysMs);
  });

  it('should create in_app and email notifications for the granter', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    expect(mockTx.notification.create).toHaveBeenCalledTimes(2);

    const calls = mockTx.notification.create.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    const channels = calls.map((c) => c[0].data.channel);
    expect(channels).toContain('in_app');
    expect(channels).toContain('email');
  });

  it('should deliver in_app notification immediately and queue email', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    const calls = mockTx.notification.create.mock.calls as Array<[{ data: Record<string, unknown> }]>;

    const inAppCall = calls.find((c) => c[0].data.channel === 'in_app');
    const emailCall = calls.find((c) => c[0].data.channel === 'email');

    expect(inAppCall?.[0].data.status).toBe('delivered');
    expect(inAppCall?.[0].data.delivered_at).toBeInstanceOf(Date);

    expect(emailCall?.[0].data.status).toBe('queued');
    expect(emailCall?.[0].data.delivered_at).toBeUndefined();
  });

  it('should include grant metadata in notification payload_json', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    const calls = mockTx.notification.create.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    const inAppCall = calls.find((c) => c[0].data.channel === 'in_app');

    expect(inAppCall?.[0].data.payload_json).toEqual({
      grant_id: GRANT_ID,
      granted_to_id: GRANTED_TO_ID,
      expires_at: grant.expires_at.toISOString(),
    });
  });

  // ─── Multiple grants ─────────────────────────────────────────────────────────

  it('should process multiple expired grants independently', async () => {
    const grant1 = buildExpiredGrant({ id: 'grant-1' });
    const grant2 = buildExpiredGrant({
      id: 'grant-2',
      granted_by_id: 'granter-2',
      granted_to_id: 'grantee-2',
      expires_at: new Date('2026-01-02T00:00:00.000Z'),
    });
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant1, grant2]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    expect(mockTx.safeguardingBreakGlassGrant.updateMany).toHaveBeenCalledTimes(2);
    expect(mockTx.behaviourTask.create).toHaveBeenCalledTimes(2);
    expect(mockTx.notification.create).toHaveBeenCalledTimes(4); // 2 per grant
  });

  it('should use correct template_key for notifications', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    const calls = mockTx.notification.create.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    calls.forEach((c) => {
      expect(c[0].data.template_key).toBe('safeguarding_break_glass_review');
    });
  });

  it('should use source_entity_type = break_glass_grant for notifications', async () => {
    const grant = buildExpiredGrant();
    mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue([grant]);

    await processor.process(buildJob(BREAK_GLASS_EXPIRY_JOB) as never);

    const calls = mockTx.notification.create.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    calls.forEach((c) => {
      expect(c[0].data.source_entity_type).toBe('break_glass_grant');
      expect(c[0].data.source_entity_id).toBe(GRANT_ID);
    });
  });
});
