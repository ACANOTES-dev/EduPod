import { deriveBackupKey } from './backup-key';

describe('deriveBackupKey', () => {
  it('derives a deterministic 32-character key from physical backup metadata', () => {
    const input = {
      finished_at: '2026-05-18T11:00:00.000Z',
      location: 'local:/opt/edupod/backups/predeploy/predeploy-20260518-110000.dump',
      size_bytes: 42_000,
      started_at: '2026-05-18T10:59:00.000Z',
      storage_kind: 'local',
    };

    expect(deriveBackupKey(input)).toBe(deriveBackupKey(input));
    expect(deriveBackupKey(input)).toHaveLength(32);
    expect(deriveBackupKey({ ...input, size_bytes: 42_001 })).not.toBe(deriveBackupKey(input));
  });

  it('uses started_at and unknown size for provisional captures', () => {
    const key = deriveBackupKey({
      location: 's3://edupod-backups/postgresql/prod/postgres.dump',
      started_at: new Date('2026-05-18T10:00:00.000Z'),
      storage_kind: 's3',
    });

    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});
