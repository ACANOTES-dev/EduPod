// Pure helpers for the parent-ack-timeline — kept in their own .ts file so
// jest can execute them as node-side unit tests (apps/web runs jest with
// testEnvironment: 'node' and picks up only *.spec.ts).

export type AckChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';
export type AckStatus = 'sent' | 'delivered' | 'read' | 'acknowledged';
export type StepKey = 'sent' | 'delivered' | 'read' | 'acknowledged';

export interface AckRow {
  id: string;
  parent_id: string;
  parent_name: string | null;
  channel: AckChannel | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
  acknowledgement_method: string | null;
  status: AckStatus;
}

export interface Step {
  key: StepKey;
  at: string | null;
  reached: boolean;
}

export function buildSteps(row: AckRow): Step[] {
  return [
    { key: 'sent', at: row.sent_at, reached: true },
    { key: 'delivered', at: row.delivered_at, reached: row.delivered_at !== null },
    { key: 'read', at: row.read_at, reached: row.read_at !== null },
    { key: 'acknowledged', at: row.acknowledged_at, reached: row.acknowledged_at !== null },
  ];
}

export function deriveStatus(
  row: Pick<AckRow, 'sent_at' | 'delivered_at' | 'read_at' | 'acknowledged_at'>,
): AckStatus {
  if (row.acknowledged_at) return 'acknowledged';
  if (row.read_at) return 'read';
  if (row.delivered_at) return 'delivered';
  return 'sent';
}

/**
 * Email opens are not trackable for most providers, so we hide the
 * "read" hover state for email rows that never transitioned to read.
 */
export function shouldShowReadPending(channel: AckChannel | null, readAt: string | null): boolean {
  if (readAt) return true;
  return channel !== 'email';
}
