import type { AckChannel, AckRow } from './parent-ack-helpers';
import { buildSteps, deriveStatus, shouldShowReadPending } from './parent-ack-helpers';

const baseRow = (overrides: Partial<AckRow> = {}): AckRow => ({
  id: 'ack-1',
  parent_id: 'parent-1',
  parent_name: 'Jane Doe',
  channel: 'in_app',
  sent_at: '2026-04-20T10:00:00Z',
  delivered_at: null,
  read_at: null,
  acknowledged_at: null,
  acknowledgement_method: null,
  status: 'sent',
  ...overrides,
});

describe('buildSteps', () => {
  it('marks only sent as reached for a freshly sent ack', () => {
    const steps = buildSteps(baseRow());
    expect(steps.map((s) => s.key)).toEqual(['sent', 'delivered', 'read', 'acknowledged']);
    expect(steps.map((s) => s.reached)).toEqual([true, false, false, false]);
  });

  it('propagates reached flags through the lifecycle', () => {
    const row = baseRow({
      delivered_at: '2026-04-20T10:01:00Z',
      read_at: '2026-04-20T10:02:00Z',
      acknowledged_at: '2026-04-20T10:03:00Z',
    });
    const steps = buildSteps(row);
    expect(steps.every((s) => s.reached)).toBe(true);
    expect(steps[0]?.at).toBe('2026-04-20T10:00:00Z');
    expect(steps[3]?.at).toBe('2026-04-20T10:03:00Z');
  });

  it('keeps later steps unreached when earlier ones stop', () => {
    const row = baseRow({ delivered_at: '2026-04-20T10:01:00Z' });
    const steps = buildSteps(row);
    expect(steps[1]?.reached).toBe(true);
    expect(steps[2]?.reached).toBe(false);
    expect(steps[3]?.reached).toBe(false);
  });
});

describe('deriveStatus', () => {
  it('falls back to sent when only sent_at is present', () => {
    expect(deriveStatus(baseRow())).toBe('sent');
  });

  it('returns delivered once delivered_at lands', () => {
    expect(deriveStatus(baseRow({ delivered_at: '2026-04-20T10:01:00Z' }))).toBe('delivered');
  });

  it('returns read when read_at is set even without delivered_at', () => {
    expect(deriveStatus(baseRow({ read_at: '2026-04-20T10:02:00Z' }))).toBe('read');
  });

  it('returns acknowledged when acknowledged_at is present', () => {
    expect(deriveStatus(baseRow({ acknowledged_at: '2026-04-20T10:03:00Z' }))).toBe('acknowledged');
  });
});

describe('shouldShowReadPending', () => {
  it('hides the read-pending hint for email rows that have not been read', () => {
    expect(shouldShowReadPending('email' as AckChannel, null)).toBe(false);
  });

  it('shows the read-pending hint for in-app, sms, and whatsapp rows', () => {
    expect(shouldShowReadPending('in_app' as AckChannel, null)).toBe(true);
    expect(shouldShowReadPending('sms' as AckChannel, null)).toBe(true);
    expect(shouldShowReadPending('whatsapp' as AckChannel, null)).toBe(true);
  });

  it('always shows when the row already has a read timestamp', () => {
    expect(shouldShowReadPending('email' as AckChannel, '2026-04-20T10:02:00Z')).toBe(true);
  });

  it('treats missing channel as trackable', () => {
    expect(shouldShowReadPending(null, null)).toBe(true);
  });
});
