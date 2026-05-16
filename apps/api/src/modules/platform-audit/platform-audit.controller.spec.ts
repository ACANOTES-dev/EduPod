import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';

describe('PlatformAuditController', () => {
  const platformAuditService = {
    get: jest.fn(),
    list: jest.fn(),
  } satisfies Pick<PlatformAuditService, 'get' | 'list'>;

  let controller: PlatformAuditController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlatformAuditController(platformAuditService as PlatformAuditService);
  });

  it('delegates list queries to the platform audit service', async () => {
    const query = { page: 2, pageSize: 25 };
    const response = { data: [], meta: { page: 2, pageSize: 25, total: 0 } };
    platformAuditService.list.mockResolvedValueOnce(response);

    await expect(controller.list(query)).resolves.toBe(response);

    expect(platformAuditService.list).toHaveBeenCalledWith(query);
  });

  it('delegates row lookup to the platform audit service', async () => {
    const row = { id: '11111111-1111-4111-8111-111111111111' };
    platformAuditService.get.mockResolvedValueOnce(row as never);

    await expect(controller.get(row.id)).resolves.toBe(row);

    expect(platformAuditService.get).toHaveBeenCalledWith(row.id);
  });
});
