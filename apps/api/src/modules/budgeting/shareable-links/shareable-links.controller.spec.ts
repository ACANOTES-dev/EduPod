import type { JwtPayload, TenantContext } from '@school/shared';

import { ShareableLinksController } from './shareable-links.controller';
import { ShareableLinksService } from './shareable-links.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const LINK_ID = '55555555-5555-5555-8555-555555555555';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'UTC',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  type: 'access',
  tenant_id: TENANT_ID,
} as unknown as JwtPayload;

describe('ShareableLinksController (authenticated CRUD)', () => {
  let controller: ShareableLinksController;
  let service: jest.Mocked<ShareableLinksService>;

  beforeEach(() => {
    service = {
      listForSnapshot: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({
        id: LINK_ID,
        token: 'tok-1',
        full_url: 'http://app/x/tok-1',
        expires_at: '2026-05-26T00:00:00Z',
      }),
      revoke: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ShareableLinksService>;
    controller = new ShareableLinksController(service);
  });

  it('GET …/links delegates to ShareableLinksService.listForSnapshot', async () => {
    await controller.list(TENANT, MODEL_ID, SNAPSHOT_ID);
    expect(service.listForSnapshot).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, SNAPSHOT_ID);
  });

  it('POST …/links delegates to ShareableLinksService.create with tenant + user + ids + dto', async () => {
    const dto = { expires_in_days: 30 as const, scenarios_visible: ['base'] };
    await controller.create(TENANT, USER, MODEL_ID, SNAPSHOT_ID, dto);
    expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID, dto);
  });

  it('POST …/links/:linkId/revoke delegates to ShareableLinksService.revoke', async () => {
    await controller.revoke(TENANT, USER, MODEL_ID, SNAPSHOT_ID, LINK_ID);
    expect(service.revoke).toHaveBeenCalledWith(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID, LINK_ID);
  });
});
