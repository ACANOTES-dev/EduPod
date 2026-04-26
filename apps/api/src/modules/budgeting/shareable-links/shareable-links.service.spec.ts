import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { filterPayloadForPublic, isUuid, ShareableLinksService } from './shareable-links.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
  // The public share resolver wraps its findUnique in runWithRlsContext
  // so the public_token_bootstrap RLS policy can match the row. The mock
  // delegates straight to fn(prisma) — no actual SET LOCAL needed in
  // unit tests since we don't hit a real DB here.
  runWithRlsContext: jest.fn(
    async (prisma: unknown, _ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  ),
}));

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN = '66666666-6666-4666-8666-666666666666';

interface BuildOptions {
  snapshot?: unknown;
  link?: unknown;
  links?: unknown[];
  findFirstLink?: unknown;
}

function build(options: BuildOptions = {}) {
  const { snapshot, link, links = [], findFirstLink } = options;
  // resolveByToken now does TWO queries: findUnique on shareableLink (no
  // joins, just flat fields) then findUnique on financialModelSnapshot
  // (with tenant + parent_model includes). For backward compatibility with
  // the existing test fixtures (which embed `parent_snapshot` on `link`),
  // we keep the embedded structure on the link mock AND derive the
  // financialModelSnapshot mock from it.
  const linkAsAny = link as Record<string, unknown> | null;
  const embeddedSnapshot = linkAsAny?.['parent_snapshot'] as Record<string, unknown> | undefined;
  const snapshotMock =
    embeddedSnapshot !== undefined
      ? {
          ...embeddedSnapshot,
          // Synthesise the joined fields the new service flow expects.
          tenant: embeddedSnapshot['tenant'] ?? { name: 'Acme', currency_code: 'EUR' },
          parent_model: embeddedSnapshot['parent_model'] ?? {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'FY26',
            fiscal_year_start: new Date('2026-09-01'),
            fiscal_year_end: new Date('2027-06-30'),
          },
        }
      : null;

  // The new flat-link shape the service queries with `select` — strip
  // parent_snapshot, add parent_snapshot_id.
  const flatLink = linkAsAny
    ? {
        ...linkAsAny,
        parent_snapshot_id:
          linkAsAny['parent_snapshot_id'] ?? '44444444-4444-4444-8444-444444444444',
        parent_model_id: linkAsAny['parent_model_id'] ?? '33333333-3333-4333-8333-333333333333',
      }
    : null;

  const prisma = {
    financialModelSnapshot: {
      findFirst: jest.fn().mockResolvedValue(snapshot ?? null),
      findUnique: jest.fn().mockResolvedValue(snapshotMock),
    },
    shareableLink: {
      findUnique: jest.fn().mockResolvedValue(flatLink),
      findFirst: jest.fn().mockResolvedValue(findFirstLink ?? null),
      findMany: jest.fn().mockResolvedValue(links),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'link-1',
        token: args.data['token'] as string,
        expires_at: args.data['expires_at'] as Date,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new ShareableLinksService(prisma as never);
  return { svc, prisma };
}

// ─── isUuid ────────────────────────────────────────────────────────────────

describe('isUuid', () => {
  it('accepts a valid v4 UUID', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
  });
  it('rejects non-UUID strings', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('11111111-1111-4111-8111')).toBe(false);
  });
});

// ─── create ────────────────────────────────────────────────────────────────

describe('ShareableLinksService — create', () => {
  it('rejects expires_in_days values that are not 7/14/30/90', async () => {
    const { svc } = build({ snapshot: { id: SNAPSHOT_ID } });
    await expect(
      svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
        expires_in_days: 5 as never,
        scenarios_visible: ['base'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when snapshot does not exist in tenant', async () => {
    const { svc } = build({ snapshot: null });
    await expect(
      svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
        expires_in_days: 30,
        scenarios_visible: ['base'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hashes password with bcrypt when supplied', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      password: 'boardonly',
      scenarios_visible: ['base'],
    });
    const data = prisma.shareableLink.create.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data['password_hash']).toBeTruthy();
    expect(data['password_hash']).not.toBe('boardonly');
    expect(await bcrypt.compare('boardonly', data['password_hash'] as string)).toBe(true);
  });

  it('null password_hash when no password supplied', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      scenarios_visible: ['base'],
    });
    const data = prisma.shareableLink.create.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data['password_hash']).toBeNull();
  });

  it('generates a UUID token', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      scenarios_visible: ['base'],
    });
    const token = (prisma.shareableLink.create.mock.calls[0]![0]!.data as Record<string, unknown>)[
      'token'
    ] as string;
    expect(isUuid(token)).toBe(true);
  });

  it('stores scenarios_visible array verbatim', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      scenarios_visible: ['base', 'cautious'],
    });
    const data = prisma.shareableLink.create.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(data['scenarios_visible']).toEqual(['base', 'cautious']);
  });

  it('sets expires_at to now() + N days', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    const before = Date.now();
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 14,
      scenarios_visible: ['base'],
    });
    const after = Date.now();
    const expires = (
      prisma.shareableLink.create.mock.calls[0]![0]!.data as Record<string, unknown>
    )['expires_at'] as Date;
    const expectedMin = before + 14 * 86_400_000 - 100;
    const expectedMax = after + 14 * 86_400_000 + 100;
    expect(expires.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(expires.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});

// ─── revoke ────────────────────────────────────────────────────────────────

describe('ShareableLinksService — revoke', () => {
  it('sets revoked_at when link exists and not yet revoked', async () => {
    const { svc, prisma } = build({
      findFirstLink: { id: 'link-1', revoked_at: null },
    });
    await svc.revoke(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, 'link-1');
    expect(prisma.shareableLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: expect.objectContaining({ revoked_at: expect.any(Date) }),
    });
  });

  it('is idempotent when already revoked', async () => {
    const { svc, prisma } = build({
      findFirstLink: { id: 'link-1', revoked_at: new Date() },
    });
    await svc.revoke(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, 'link-1');
    expect(prisma.shareableLink.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when link missing in tenant', async () => {
    const { svc } = build({ findFirstLink: null });
    await expect(
      svc.revoke(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, 'link-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── listForSnapshot ───────────────────────────────────────────────────────

describe('ShareableLinksService — listForSnapshot', () => {
  it('throws NotFound when snapshot missing', async () => {
    const { svc } = build({ snapshot: null });
    await expect(svc.listForSnapshot(TENANT_A, MODEL_ID, SNAPSHOT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns rows with has_password derived but never the hash itself', async () => {
    const { svc } = build({
      snapshot: { id: SNAPSHOT_ID },
      links: [
        {
          id: 'link-1',
          token: TOKEN,
          expires_at: new Date('2026-12-31T00:00:00Z'),
          revoked_at: null,
          view_count: 3,
          last_viewed_at: new Date('2026-04-20T10:00:00Z'),
          scenarios_visible: ['base', 'growth'],
          password_hash: '$2a$12$something',
          created_at: new Date('2026-04-10T00:00:00Z'),
          created_by: USER_ID,
        },
        {
          id: 'link-2',
          token: '77777777-7777-4777-8777-777777777777',
          expires_at: new Date('2026-06-30T00:00:00Z'),
          revoked_at: null,
          view_count: 0,
          last_viewed_at: null,
          scenarios_visible: ['base'],
          password_hash: null,
          created_at: new Date('2026-04-15T00:00:00Z'),
          created_by: USER_ID,
        },
      ],
    });
    const out = await svc.listForSnapshot(TENANT_A, MODEL_ID, SNAPSHOT_ID);
    expect(out.data).toHaveLength(2);
    expect(out.data[0]!.has_password).toBe(true);
    expect(out.data[1]!.has_password).toBe(false);
    expect((out.data[0]! as unknown as Record<string, unknown>)['password_hash']).toBeUndefined();
    expect(out.data[0]!.scenarios_visible).toEqual(['base', 'growth']);
  });
});

// ─── resolveByToken ────────────────────────────────────────────────────────

describe('ShareableLinksService — resolveByToken', () => {
  const baseLink = {
    id: 'link-1',
    tenant_id: TENANT_A,
    expires_at: new Date(Date.now() + 86_400_000),
    revoked_at: null,
    password_hash: null,
    scenarios_visible: ['base'],
    parent_snapshot: {
      tenant_id: TENANT_A,
      version_number: 1,
      published_at: new Date('2026-04-01T00:00:00Z'),
      payload: {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            amount: 1000,
            computed_from: { secret: true },
          },
        ],
        totals_by_year: [{ fiscal_year: 1, revenue: 1000, expenditure: 800, net_result: 200 }],
        scenarios: [
          { name: 'base', line_items: [] },
          { name: 'growth', line_items: [] },
        ],
      },
      tenant: { name: 'Acme', currency_code: 'EUR' },
      parent_model: {
        id: MODEL_ID,
        name: 'FY26',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-06-30'),
      },
    },
  };

  it('returns 404 for non-uuid token', async () => {
    const { svc } = build({ link: null });
    await expect(svc.resolveByToken('not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when token unknown', async () => {
    const { svc } = build({ link: null });
    await expect(svc.resolveByToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when expired', async () => {
    const { svc } = build({
      link: { ...baseLink, expires_at: new Date(Date.now() - 1000) },
    });
    await expect(svc.resolveByToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when revoked', async () => {
    const { svc } = build({
      link: { ...baseLink, revoked_at: new Date() },
    });
    await expect(svc.resolveByToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when password required but not supplied', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    await expect(svc.resolveByToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when password wrong', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    await expect(svc.resolveByToken(TOKEN, 'wrong')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns sanitised payload when password correct', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    const out = await svc.resolveByToken(TOKEN, 'letmein');
    expect(out.tenant_name).toBe('Acme');
    expect(out.payload['scenarios']).toBeDefined();
    expect(
      (out.payload['line_items'] as Array<Record<string, unknown>>)[0]!['computed_from'],
    ).toBeUndefined();
  });

  it('SECURITY: returns 404 when link.tenant_id does not match snapshot.tenant_id', async () => {
    const { svc } = build({
      link: {
        ...baseLink,
        tenant_id: TENANT_A,
        parent_snapshot: { ...baseLink.parent_snapshot, tenant_id: TENANT_B },
      },
    });
    await expect(svc.resolveByToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters scenarios to scenarios_visible', async () => {
    const { svc } = build({
      link: { ...baseLink, scenarios_visible: ['base'] },
    });
    const out = await svc.resolveByToken(TOKEN);
    const scenarios = out.payload['scenarios'] as Array<{ name: string }>;
    expect(scenarios.find((s) => s.name === 'growth')).toBeUndefined();
    expect(scenarios.find((s) => s.name === 'base')).toBeDefined();
  });

  it('increments view_count on each successful resolve', async () => {
    const { svc, prisma } = build({ link: baseLink });
    await svc.resolveByToken(TOKEN);
    expect(prisma.shareableLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: expect.objectContaining({
        view_count: { increment: 1 },
        last_viewed_at: expect.any(Date),
      }),
    });
  });

  it('produces fy label "2026/27" for cross-year fiscal range', async () => {
    const { svc } = build({ link: baseLink });
    const out = await svc.resolveByToken(TOKEN);
    expect(out.fiscal_year_label).toBe('2026/27');
  });
});

// ─── PII scrubbing ─────────────────────────────────────────────────────────

describe('filterPayloadForPublic', () => {
  it('drops household / student / staff arrays', () => {
    const out = filterPayloadForPublic(
      {
        line_items: [],
        households: [{ id: 'h1', name: 'Doe Family' }],
        students: [{ id: 's1', name: 'Alice' }],
        staff: [{ id: 'st1', name: 'Mr Smith', salary: 50_000 }],
        individual_payroll: [{ id: 'p1', amount: 4000 }],
      },
      ['base'],
    );
    expect(out['households']).toBeUndefined();
    expect(out['students']).toBeUndefined();
    expect(out['staff']).toBeUndefined();
    expect(out['individual_payroll']).toBeUndefined();
  });

  it('strips per-row arrays from source_data_snapshot but keeps aggregates', () => {
    const out = filterPayloadForPublic(
      {
        source_data_snapshot: {
          total_active_students: 600,
          students_by_year_group: [{ year_group_id: 'yg1', active_count: 60 }],
          fees_by_year_group: [],
          staff_by_department: [],
        },
      },
      ['base'],
    );
    const src = out['source_data_snapshot'] as Record<string, unknown>;
    expect(src['total_active_students']).toBe(600);
    expect(src['students_by_year_group']).toBeUndefined();
    expect(src['fees_by_year_group']).toBeUndefined();
    expect(src['staff_by_department']).toBeUndefined();
  });

  it('strips per-row arrays from source_snapshot too (snapshot v1 naming)', () => {
    const out = filterPayloadForPublic(
      {
        source_snapshot: {
          total_active_students: 600,
          students_by_year_group: [{ year_group_id: 'yg1', active_count: 60 }],
        },
      },
      ['base'],
    );
    const src = out['source_snapshot'] as Record<string, unknown>;
    expect(src['total_active_students']).toBe(600);
    expect(src['students_by_year_group']).toBeUndefined();
  });

  it('strips computed_from from line_items at top level', () => {
    const out = filterPayloadForPublic(
      {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            amount: 100,
            computed_from: { department_id: 'd1' },
          },
        ],
      },
      ['base'],
    );
    const li = (out['line_items'] as Array<Record<string, unknown>>)[0]!;
    expect(li['computed_from']).toBeUndefined();
    expect(li['amount']).toBe(100);
  });

  it('strips computed_from from base_case.line_items (snapshot v1 nesting)', () => {
    const out = filterPayloadForPublic(
      {
        base_case: {
          line_items: [
            {
              category: 'income',
              amount: 100,
              computed_from: { year_group_id: 'yg1' },
            },
          ],
        },
      },
      ['base'],
    );
    const baseCase = out['base_case'] as Record<string, unknown>;
    const li = (baseCase['line_items'] as Array<Record<string, unknown>>)[0]!;
    expect(li['computed_from']).toBeUndefined();
    expect(li['amount']).toBe(100);
  });

  it('respects scenarios_visible allowlist', () => {
    const out = filterPayloadForPublic(
      {
        scenarios: [
          { name: 'base', line_items: [] },
          { name: 'growth', line_items: [] },
          { name: 'stress', line_items: [] },
        ],
      },
      ['base', 'growth'],
    );
    const scen = out['scenarios'] as Array<{ name: string }>;
    expect(scen.map((s) => s.name)).toEqual(['base', 'growth']);
  });

  it('returns {} for null / non-object payloads', () => {
    expect(filterPayloadForPublic(null, ['base'])).toEqual({});
    expect(filterPayloadForPublic('string', ['base'])).toEqual({});
    expect(filterPayloadForPublic(42, ['base'])).toEqual({});
  });
});
