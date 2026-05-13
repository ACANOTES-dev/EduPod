import { Job } from 'bullmq';

import {
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  ShareableLinkCleanupProcessor,
} from './shareable-link-cleanup.processor';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DISABLED_TENANT_ID = '22222222-2222-4222-8222-222222222222';

function buildTenantModuleService(enabledTenants: readonly string[] = [TENANT_ID]) {
  return {
    isEnabled: jest
      .fn()
      .mockImplementation(async (tenantId: string) => enabledTenants.includes(tenantId)),
  };
}

describe('ShareableLinkCleanupProcessor', () => {
  it('deletes only links whose expires_at is older than 30 days', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'link-1', tenant_id: TENANT_ID }]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = { shareableLink: { findMany, deleteMany } };
    const proc = new ShareableLinkCleanupProcessor(
      prisma as never,
      buildTenantModuleService() as never,
    );
    await proc.process({
      id: 'job',
      name: BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
    } as unknown as Job);
    expect(findMany).toHaveBeenCalledTimes(1);
    const findArg = findMany.mock.calls[0]![0] as { where: { expires_at: { lt: Date } } };
    expect(findArg.where.expires_at.lt).toBeInstanceOf(Date);
    const cutoff = findArg.where.expires_at.lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 0);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['link-1'] } } });
  });

  it('skips expired links for tenants with budgeting disabled', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'link-enabled', tenant_id: TENANT_ID },
      { id: 'link-disabled', tenant_id: DISABLED_TENANT_ID },
    ]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { shareableLink: { findMany, deleteMany } };
    const tenantModuleService = buildTenantModuleService([TENANT_ID]);
    const proc = new ShareableLinkCleanupProcessor(prisma as never, tenantModuleService as never);

    await proc.process({
      id: 'job',
      name: BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
    } as unknown as Job);

    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'budgeting');
    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith(DISABLED_TENANT_ID, 'budgeting');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['link-enabled'] } } });
  });

  it('does nothing for unknown job names', async () => {
    const findMany = jest.fn();
    const deleteMany = jest.fn();
    const prisma = { shareableLink: { findMany, deleteMany } };
    const proc = new ShareableLinkCleanupProcessor(
      prisma as never,
      buildTenantModuleService() as never,
    );
    await proc.process({ id: 'job', name: 'wrong:name' } as unknown as Job);
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
