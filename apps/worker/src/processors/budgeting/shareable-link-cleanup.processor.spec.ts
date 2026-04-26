import { Job } from 'bullmq';

import {
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  ShareableLinkCleanupProcessor,
} from './shareable-link-cleanup.processor';

describe('ShareableLinkCleanupProcessor', () => {
  it('deletes only links whose expires_at is older than 30 days', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = { shareableLink: { deleteMany } };
    const proc = new ShareableLinkCleanupProcessor(prisma as never);
    await proc.process({
      id: 'job',
      name: BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
    } as unknown as Job);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const arg = deleteMany.mock.calls[0]![0] as { where: { expires_at: { lt: Date } } };
    expect(arg.where.expires_at.lt).toBeInstanceOf(Date);
    const cutoff = arg.where.expires_at.lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 0);
  });

  it('does nothing for unknown job names', async () => {
    const deleteMany = jest.fn();
    const prisma = { shareableLink: { deleteMany } };
    const proc = new ShareableLinkCleanupProcessor(prisma as never);
    await proc.process({ id: 'job', name: 'wrong:name' } as unknown as Job);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
