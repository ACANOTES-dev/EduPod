import { EmailDomainController } from './email-domain.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOMAIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function build() {
  const svc = {
    registerDomain: jest.fn().mockResolvedValue({ id: DOMAIN_ID, domain: 'school.edu' }),
    listDomains: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    getDomain: jest.fn().mockResolvedValue({ id: DOMAIN_ID }),
    refreshDomain: jest.fn().mockResolvedValue({ id: DOMAIN_ID, status: 'verified' }),
    deleteDomain: jest.fn().mockResolvedValue(undefined),
  };
  const ctrl = new EmailDomainController(svc as never);
  return { ctrl, svc };
}

describe('EmailDomainController', () => {
  it('POST / delegates with normalised tenant + user ids and dto.domain', async () => {
    const { ctrl, svc } = build();
    const result = await ctrl.register(
      { tenant_id: TENANT_ID } as never,
      { sub: USER_ID } as never,
      { domain: 'school.edu' } as never,
    );
    expect(svc.registerDomain).toHaveBeenCalledWith(TENANT_ID, USER_ID, 'school.edu');
    expect(result).toEqual({ id: DOMAIN_ID, domain: 'school.edu' });
  });

  it('GET / forwards page and pageSize as numbers', async () => {
    const { ctrl, svc } = build();
    await ctrl.list({ tenant_id: TENANT_ID } as never, '2', '50');
    expect(svc.listDomains).toHaveBeenCalledWith(TENANT_ID, 2, 50);
  });

  it('GET / defaults page=1 pageSize=20', async () => {
    const { ctrl, svc } = build();
    await ctrl.list({ tenant_id: TENANT_ID } as never);
    expect(svc.listDomains).toHaveBeenCalledWith(TENANT_ID, 1, 20);
  });

  it('GET /:id delegates getDomain', async () => {
    const { ctrl, svc } = build();
    await ctrl.getOne({ tenant_id: TENANT_ID } as never, DOMAIN_ID);
    expect(svc.getDomain).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID);
  });

  it('POST /:id/refresh delegates refreshDomain', async () => {
    const { ctrl, svc } = build();
    const result = await ctrl.refresh({ tenant_id: TENANT_ID } as never, DOMAIN_ID);
    expect(svc.refreshDomain).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID);
    expect(result.status).toBe('verified');
  });

  it('DELETE /:id delegates deleteDomain', async () => {
    const { ctrl, svc } = build();
    await ctrl.remove({ tenant_id: TENANT_ID } as never, { sub: USER_ID } as never, DOMAIN_ID);
    expect(svc.deleteDomain).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID, USER_ID);
  });
});
