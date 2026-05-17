import { createHash } from 'crypto';

export interface BackupKeyInput {
  finished_at?: Date | string | null;
  location: string;
  size_bytes?: bigint | number | string | null;
  started_at: Date | string;
  storage_kind: string;
}

export function deriveBackupKey(input: BackupKeyInput): string {
  const anchor = input.finished_at ?? input.started_at;
  const size =
    input.size_bytes === null || input.size_bytes === undefined ? 'unknown' : input.size_bytes;
  return createHash('sha256')
    .update(`${input.storage_kind}|${input.location}|${toIso(anchor)}|${String(size)}`)
    .digest('hex')
    .slice(0, 32);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
