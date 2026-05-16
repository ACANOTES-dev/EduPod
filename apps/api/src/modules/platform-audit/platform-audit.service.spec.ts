import { PlatformAuditService } from './platform-audit.service';

describe('PlatformAuditService', () => {
  const rows: Array<{
    id: string;
    actor_user_id: string;
    action: 'tenant_suspend';
    target_resource_type: string;
    target_resource_id: string;
    target_tenant_id: string;
    payload: unknown;
    reason: string | null;
    ip_address: string | null;
    user_agent: string | null;
    prev_hash: string | null;
    row_hash: string;
    created_at: Date;
  }> = [];

  const prisma = {
    $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
    platformAuditLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  let service: PlatformAuditService;

  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
    prisma.platformAuditLog.findFirst.mockImplementation(async () => {
      const previous = rows.at(-1);
      return previous ? { row_hash: previous.row_hash } : null;
    });
    prisma.platformAuditLog.create.mockImplementation(
      async ({ data }: { data: (typeof rows)[number] }) => {
        const row = { ...data, id: `audit-${rows.length + 1}` };
        rows.push(row);
        return row;
      },
    );
    prisma.platformAuditLog.findMany.mockImplementation(async () => rows);
    service = new PlatformAuditService(prisma as never);
  });

  it('lists filtered audit rows with pagination metadata', async () => {
    prisma.platformAuditLog.findMany.mockResolvedValueOnce(rows);
    prisma.platformAuditLog.count.mockResolvedValueOnce(2);

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        action: 'tenant_suspend',
        actor_user_id: '11111111-1111-1111-1111-111111111111',
        target_resource_type: 'tenant',
        target_tenant_id: '22222222-2222-2222-2222-222222222222',
        start_date: new Date('2026-05-01T00:00:00.000Z'),
        end_date: new Date('2026-05-16T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ data: rows, meta: { page: 2, pageSize: 10, total: 2 } });

    expect(prisma.platformAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          action: 'tenant_suspend',
          actor_user_id: '11111111-1111-1111-1111-111111111111',
          target_resource_type: 'tenant',
          target_tenant_id: '22222222-2222-2222-2222-222222222222',
        }),
      }),
    );
  });

  it('returns an audit row by id', async () => {
    const row = { id: 'audit-1' };
    prisma.platformAuditLog.findUnique.mockResolvedValueOnce(row);

    await expect(service.get('audit-1')).resolves.toBe(row);

    expect(prisma.platformAuditLog.findUnique).toHaveBeenCalledWith({
      where: { id: 'audit-1' },
      include: {
        actor: {
          select: { email: true, first_name: true, last_name: true },
        },
      },
    });
  });

  it('throws when an audit row does not exist', async () => {
    prisma.platformAuditLog.findUnique.mockResolvedValueOnce(null);

    await expect(service.get('missing')).rejects.toMatchObject({
      response: {
        code: 'PLATFORM_AUDIT_LOG_NOT_FOUND',
      },
    });
  });

  it('writes linked hashes for consecutive audit rows', async () => {
    const first = await service.log({
      actor_user_id: '11111111-1111-1111-1111-111111111111',
      action: 'tenant_suspend',
      target_resource_type: 'tenant',
      target_resource_id: 'tenant-1',
      target_tenant_id: '22222222-2222-2222-2222-222222222222',
      payload: { before: { status: 'active' }, after: { status: 'suspended' } },
    });
    const second = await service.log({
      actor_user_id: '11111111-1111-1111-1111-111111111111',
      action: 'tenant_suspend',
      target_resource_type: 'tenant',
      target_resource_id: 'tenant-2',
      target_tenant_id: '33333333-3333-3333-3333-333333333333',
      payload: { before: { status: 'active' }, after: { status: 'suspended' } },
    });

    expect(first.prev_hash).toBeNull();
    expect(second.prev_hash).toBe(first.row_hash);
    expect(second.row_hash).toHaveLength(64);
    await expect(service.verifyChainIntegrity()).resolves.toEqual({ broken_at: null });
  });

  it('serializes bigint payload values before hashing and persistence', async () => {
    await expect(
      service.log({
        actor_user_id: '11111111-1111-1111-1111-111111111111',
        action: 'tenant_suspend',
        target_resource_type: 'tenant',
        target_resource_id: 'tenant-1',
        payload: {
          after: {
            sequence: 42n,
            created_at: new Date('2026-05-16T00:00:00.000Z'),
          },
        },
      }),
    ).resolves.toMatchObject({ id: 'audit-1' });

    expect(prisma.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: {
          after: {
            sequence: '42',
            created_at: '2026-05-16T00:00:00.000Z',
          },
        },
      }),
    });
  });

  it('detects a corrupted hash-chain link', async () => {
    await service.log({
      actor_user_id: '11111111-1111-1111-1111-111111111111',
      action: 'tenant_suspend',
      target_resource_type: 'tenant',
      target_resource_id: 'tenant-1',
      target_tenant_id: '22222222-2222-2222-2222-222222222222',
      payload: { before: { status: 'active' }, after: { status: 'suspended' } },
    });
    await service.log({
      actor_user_id: '11111111-1111-1111-1111-111111111111',
      action: 'tenant_suspend',
      target_resource_type: 'tenant',
      target_resource_id: 'tenant-2',
      target_tenant_id: '33333333-3333-3333-3333-333333333333',
      payload: { before: { status: 'active' }, after: { status: 'suspended' } },
    });
    rows[1] = { ...rows[1], prev_hash: 'bad'.padEnd(64, '0') };

    await expect(service.verifyChainIntegrity()).resolves.toEqual({ broken_at: 'audit-2' });
  });
});
