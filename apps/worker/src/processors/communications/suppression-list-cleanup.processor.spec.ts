import type { Job } from 'bullmq';

import {
  SUPPRESSION_LIST_CLEANUP_JOB,
  SuppressionListCleanupProcessor,
} from './suppression-list-cleanup.processor';

describe('SuppressionListCleanupProcessor', () => {
  it('deletes only rows whose expires_at has passed', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 7 });
    const prisma = { notificationSuppressionList: { deleteMany } } as never;
    const proc = new SuppressionListCleanupProcessor(prisma);
    await proc.process({ id: 'j', name: SUPPRESSION_LIST_CLEANUP_JOB } as unknown as Job);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const where = deleteMany.mock.calls[0][0].where;
    expect(where.expires_at.not).toBeNull();
    expect(where.expires_at.lt).toBeInstanceOf(Date);
  });

  it('does nothing for a different job name', async () => {
    const deleteMany = jest.fn();
    const prisma = { notificationSuppressionList: { deleteMany } } as never;
    const proc = new SuppressionListCleanupProcessor(prisma);
    await proc.process({ id: 'j', name: 'other:job' } as unknown as Job);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
