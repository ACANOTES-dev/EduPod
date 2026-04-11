import type { JwtPayload } from '@school/shared';

import { InboxSearchController } from './inbox-search.controller';
import type { InboxSearchService } from './inbox-search.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('InboxSearchController', () => {
  let controller: InboxSearchController;
  let service: jest.Mocked<InboxSearchService>;

  beforeEach(() => {
    service = {
      search: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      }),
    } as unknown as jest.Mocked<InboxSearchService>;
    controller = new InboxSearchController(service);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates to the service with hardcoded scope=user', async () => {
    await controller.search({ tenant_id: TENANT_ID }, { sub: USER_ID } as JwtPayload, {
      q: 'permission slip',
      page: 1,
      pageSize: 20,
    });

    expect(service.search).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      userId: USER_ID,
      query: 'permission slip',
      scope: 'user',
      pagination: { page: 1, pageSize: 20 },
    });
  });

  it('cannot be tricked into tenant scope from the query string', async () => {
    await controller.search(
      { tenant_id: TENANT_ID },
      { sub: USER_ID } as JwtPayload,
      // Caller passes a scope-like field — the controller ignores it.
      {
        q: 'permission slip',
        page: 1,
        pageSize: 20,
      } as unknown as { q: string; page: number; pageSize: number },
    );

    const [call] = service.search.mock.calls;
    if (!call) throw new Error('expected service.search to be called');
    expect(call[0].scope).toBe('user');
  });

  it('forwards the pagination window unchanged', async () => {
    await controller.search({ tenant_id: TENANT_ID }, { sub: USER_ID } as JwtPayload, {
      q: 'permission slip',
      page: 3,
      pageSize: 10,
    });

    const [call] = service.search.mock.calls;
    if (!call) throw new Error('expected service.search to be called');
    expect(call[0].pagination).toEqual({ page: 3, pageSize: 10 });
  });
});
