import { BackupReadinessScheduledTask } from './backup-readiness-scheduled.task';

describe('BackupReadinessScheduledTask', () => {
  it('polls replication metadata before computing readiness', async () => {
    const backups = { checkAndAlert: jest.fn().mockResolvedValue(undefined) };
    const replications = { poll: jest.fn().mockResolvedValue({ scanned: 1, upserted: 1 }) };
    const task = new BackupReadinessScheduledTask(backups as never, replications as never);

    await task.tick();

    expect(replications.poll).toHaveBeenCalledTimes(1);
    expect(backups.checkAndAlert).toHaveBeenCalledTimes(1);
    expect(replications.poll.mock.invocationCallOrder[0]).toBeLessThan(
      backups.checkAndAlert.mock.invocationCallOrder[0],
    );
  });

  it('continues readiness checks when off-site polling fails', async () => {
    const backups = { checkAndAlert: jest.fn().mockResolvedValue(undefined) };
    const replications = { poll: jest.fn().mockRejectedValue(new Error('s3 unavailable')) };
    const task = new BackupReadinessScheduledTask(backups as never, replications as never);

    await task.tick();

    expect(backups.checkAndAlert).toHaveBeenCalledTimes(1);
  });

  it('swallows readiness failures after logging so cron keeps running', async () => {
    const backups = { checkAndAlert: jest.fn().mockRejectedValue(new Error('db unavailable')) };
    const replications = { poll: jest.fn().mockResolvedValue({ scanned: 0, upserted: 0 }) };
    const task = new BackupReadinessScheduledTask(backups as never, replications as never);

    await expect(task.tick()).resolves.toBeUndefined();
  });
});
