/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';

jest.mock('../../../common/middleware/rls.middleware', () => {
  const actual = jest.requireActual('../../../common/middleware/rls.middleware');
  return {
    ...actual,
    createRlsClient: jest.fn(),
  };
});

import { createRlsClient } from '../../../common/middleware/rls.middleware';

import { InboxSearchService } from './inbox-search.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONV_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MSG_ID_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee11';
const MSG_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee22';

interface MockTx {
  $queryRaw: jest.Mock;
}

function buildMockTx(): MockTx {
  return {
    $queryRaw: jest.fn(),
  };
}

function mockRlsTransaction(tx: MockTx): {
  txFn: jest.Mock;
  capturedContext: { tenant_id?: string; user_id?: string };
} {
  const capturedContext: { tenant_id?: string; user_id?: string } = {};
  const txFn = jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx));
  (createRlsClient as jest.Mock).mockImplementation((_prisma, context) => {
    Object.assign(capturedContext, context);
    return { $transaction: txFn };
  });
  return { txFn, capturedContext };
}

function hitRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message_id: MSG_ID_1,
    conversation_id: CONV_ID,
    conversation_subject: 'Trip permission slip',
    conversation_kind: 'direct',
    sender_user_id: ACTOR_ID,
    sender_first_name: 'Alice',
    sender_last_name: 'Doe',
    sender_email: 'alice@example.test',
    body_snippet: 'Please bring the <mark>permission</mark> slip tomorrow',
    created_at: new Date('2026-04-10T09:00:00Z'),
    rank: 0.78,
    ...overrides,
  };
}

describe('InboxSearchService', () => {
  let service: InboxSearchService;
  let tx: MockTx;
  let prisma: Record<string, unknown>;
  let capturedContext: { tenant_id?: string; user_id?: string };

  beforeEach(() => {
    prisma = {};
    tx = buildMockTx();
    ({ capturedContext } = mockRlsTransaction(tx));
    service = new InboxSearchService(prisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Input validation ─────────────────────────────────────────────────────

  describe('query validation', () => {
    it('rejects queries shorter than 2 characters with SEARCH_QUERY_TOO_SHORT', async () => {
      await expect(
        service.search({
          tenantId: TENANT_ID,
          userId: ACTOR_ID,
          query: 'a',
          scope: 'user',
          pagination: { page: 1, pageSize: 20 },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEARCH_QUERY_TOO_SHORT' }),
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects queries longer than 200 characters with SEARCH_QUERY_TOO_LONG', async () => {
      await expect(
        service.search({
          tenantId: TENANT_ID,
          userId: ACTOR_ID,
          query: 'x'.repeat(201),
          scope: 'user',
          pagination: { page: 1, pageSize: 20 },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEARCH_QUERY_TOO_LONG' }),
      });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects pageSize over 50 with SEARCH_PAGE_SIZE_TOO_LARGE', async () => {
      await expect(
        service.search({
          tenantId: TENANT_ID,
          userId: ACTOR_ID,
          query: 'permission slip',
          scope: 'user',
          pagination: { page: 1, pageSize: 100 },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SEARCH_PAGE_SIZE_TOO_LARGE' }),
      });
    });

    it('returns empty result without a DB hit for punctuation-only queries', async () => {
      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: '!!!!',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });
      expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects invalid pagination values', async () => {
      await expect(
        service.search({
          tenantId: TENANT_ID,
          userId: ACTOR_ID,
          query: 'permission',
          scope: 'user',
          pagination: { page: 0, pageSize: 20 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── User scope ──────────────────────────────────────────────────────────

  describe('user scope', () => {
    it('returns hits and computes pagination metadata from total count', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([hitRow(), hitRow({ message_id: MSG_ID_2, rank: 0.42 })])
        .mockResolvedValueOnce([{ count: 2n }]);

      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      const first = result.data[0];
      if (!first) throw new Error('expected first hit');
      expect(first.sender_display_name).toBe('Alice Doe');
      expect(first.body_snippet).toContain('<mark>permission</mark>');
      expect(first.rank).toBe(0.78);
    });

    it('passes tenant + user context to the RLS client', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });

      expect(capturedContext).toEqual({ tenant_id: TENANT_ID, user_id: ACTOR_ID });
    });

    it('embeds the participant-filter clause when scope is user', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });

      const sqlCall = tx.$queryRaw.mock.calls[0][0];
      const fragments = (sqlCall as { strings?: string[] }).strings ?? [];
      const joined = fragments.join(' ');
      expect(joined).toContain('conversation_participants');
    });
  });

  // ─── Tenant scope (oversight) ─────────────────────────────────────────────

  describe('tenant scope', () => {
    it('omits the participant-filter clause when scope is tenant', async () => {
      tx.$queryRaw.mockResolvedValueOnce([hitRow()]).mockResolvedValueOnce([{ count: 1n }]);

      await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'tenant',
        pagination: { page: 1, pageSize: 20 },
      });

      const sqlCall = tx.$queryRaw.mock.calls[0][0];
      const fragments = (sqlCall as { strings?: string[] }).strings ?? [];
      const joined = fragments.join(' ');
      expect(joined).not.toContain('conversation_participants');
    });

    it('returns hits across all threads in tenant scope', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([hitRow(), hitRow({ message_id: MSG_ID_2 })])
        .mockResolvedValueOnce([{ count: 2n }]);

      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'tenant',
        pagination: { page: 1, pageSize: 20 },
      });
      expect(result.data).toHaveLength(2);
    });
  });

  // ─── Edge cases and safety ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('falls back to sender email when first/last name are empty', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([hitRow({ sender_first_name: '', sender_last_name: '' })])
        .mockResolvedValueOnce([{ count: 1n }]);

      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });
      const first = result.data[0];
      if (!first) throw new Error('expected first hit');
      expect(first.sender_display_name).toBe('alice@example.test');
    });

    it('coerces bigint totals into a plain number', async () => {
      tx.$queryRaw.mockResolvedValueOnce([hitRow()]).mockResolvedValueOnce([{ count: 42n }]);

      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 1, pageSize: 20 },
      });
      expect(result.meta.total).toBe(42);
    });

    it('RLS leakage: scope targets the caller tenant, never crosses', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      await service.search({
        tenantId: OTHER_TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'tenant',
        pagination: { page: 1, pageSize: 20 },
      });

      expect(capturedContext.tenant_id).toBe(OTHER_TENANT_ID);
    });

    it('respects the provided pagination offset for subsequent pages', async () => {
      tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

      const result = await service.search({
        tenantId: TENANT_ID,
        userId: ACTOR_ID,
        query: 'permission',
        scope: 'user',
        pagination: { page: 3, pageSize: 10 },
      });

      expect(result.meta).toEqual({ page: 3, pageSize: 10, total: 0 });
    });
  });
});
