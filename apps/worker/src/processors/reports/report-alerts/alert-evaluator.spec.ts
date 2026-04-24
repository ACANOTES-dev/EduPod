import type { Prisma, ReportAlert } from '@prisma/client';

import {
  evaluateAlert,
  evaluateOperator,
  evaluateTenant,
  shouldDispatch,
} from './alert-evaluator';
import type { PrismaTransaction } from './metric-registry';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const ALERT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RECIPIENT_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildAlert(overrides: Partial<ReportAlert> = {}): ReportAlert {
  return {
    id: ALERT_ID,
    tenant_id: TENANT_ID,
    name: 'Overdue invoices high',
    metric: 'overdue_invoices_count',
    operator: 'gt',
    threshold: { toString: () => '5' } as unknown as Prisma.Decimal,
    check_frequency: 'daily',
    notification_recipients_json: ['admin@school.test'] as unknown as Prisma.JsonValue,
    active: true,
    last_triggered_at: null,
    last_measured_value: null,
    created_by_user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

interface MockTxState {
  invoiceCount: number;
  alerts: ReportAlert[];
  membershipUserIds: string[];
  recentRuns: Array<{ outcome: 'ok' | 'threshold_crossed' | 'error'; evaluated_at: Date }>;
  notificationsCreated: Array<Record<string, unknown>>;
  alertRunsCreated: Array<Record<string, unknown>>;
  alertUpdates: Array<{ id: string; data: Record<string, unknown> }>;
}

function buildMockTx(initial: Partial<MockTxState> = {}): {
  tx: PrismaTransaction;
  state: MockTxState;
} {
  const state: MockTxState = {
    invoiceCount: 0,
    alerts: [],
    membershipUserIds: [],
    recentRuns: [],
    notificationsCreated: [],
    alertRunsCreated: [],
    alertUpdates: [],
    ...initial,
  };

  const tx = {
    invoice: {
      count: jest.fn().mockImplementation(() => Promise.resolve(state.invoiceCount)),
    },
    reportAlert: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(state.alerts)),
      update: jest.fn().mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.alertUpdates.push({ id: args.where.id, data: args.data });
        return Promise.resolve({});
      }),
    },
    reportAlertRun: {
      findFirst: jest.fn().mockImplementation((args: { where: { outcome: string } }) => {
        const match = state.recentRuns.find((r) => r.outcome === args.where.outcome);
        return Promise.resolve(match ?? null);
      }),
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        state.alertRunsCreated.push(args.data);
        return Promise.resolve({});
      }),
    },
    notification: {
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        state.notificationsCreated.push(args.data);
        return Promise.resolve({});
      }),
    },
    tenantMembership: {
      findMany: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(state.membershipUserIds.map((user_id) => ({ user_id }))),
        ),
    },
  };

  return { tx: tx as unknown as PrismaTransaction, state };
}

describe('evaluateOperator', () => {
  it.each([
    ['gt', 6, 5, true],
    ['gt', 5, 5, false],
    ['gte', 5, 5, true],
    ['gte', 4, 5, false],
    ['lt', 4, 5, true],
    ['lt', 5, 5, false],
    ['lte', 5, 5, true],
    ['lte', 6, 5, false],
    ['eq', 5.0001, 5, true],
    ['eq', 5.01, 5, false],
    ['ne', 5.01, 5, true],
    ['ne', 5.0001, 5, false],
  ])('%s: value=%s threshold=%s → %s', (op, value, threshold, expected) => {
    expect(evaluateOperator(value, op, threshold)).toBe(expected);
  });

  it('returns false for unknown operators', () => {
    expect(evaluateOperator(1, 'invalid', 0)).toBe(false);
  });
});

describe('shouldDispatch (anti-spam)', () => {
  it('allows dispatch when no recent threshold_crossed run exists', async () => {
    const { tx } = buildMockTx({ recentRuns: [] });
    const result = await shouldDispatch(tx, ALERT_ID, new Date());
    expect(result).toBe(true);
  });

  it('suppresses when a threshold_crossed exists with no ok in between', async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const { tx } = buildMockTx({
      recentRuns: [{ outcome: 'threshold_crossed', evaluated_at: tenMinAgo }],
    });
    const result = await shouldDispatch(tx, ALERT_ID, new Date());
    expect(result).toBe(false);
  });

  it('allows dispatch after a return-to-ok', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const { tx } = buildMockTx({
      recentRuns: [
        { outcome: 'threshold_crossed', evaluated_at: oneHourAgo },
        { outcome: 'ok', evaluated_at: thirtyMinAgo },
      ],
    });
    const result = await shouldDispatch(tx, ALERT_ID, new Date());
    expect(result).toBe(true);
  });
});

describe('evaluateAlert', () => {
  it('writes outcome=ok and updates last_measured_value when not crossed', async () => {
    const { tx, state } = buildMockTx({ invoiceCount: 2 });
    const alert = buildAlert({
      threshold: { toString: () => '5' } as unknown as Prisma.Decimal,
    });
    const result = await evaluateAlert(tx, TENANT_ID, alert);
    expect(result.outcome).toBe('ok');
    expect(result.measured_value).toBe(2);
    expect(state.alertRunsCreated[0]!.outcome).toBe('ok');
    expect(state.alertUpdates[0]!.data.last_measured_value).toBe(2);
    expect(state.alertUpdates[0]!.data.last_triggered_at).toBeUndefined();
  });

  it('dispatches and writes threshold_crossed when crossed', async () => {
    const { tx, state } = buildMockTx({
      invoiceCount: 10,
      membershipUserIds: [RECIPIENT_USER_ID],
    });
    const alert = buildAlert({
      threshold: { toString: () => '5' } as unknown as Prisma.Decimal,
    });
    const result = await evaluateAlert(tx, TENANT_ID, alert);
    expect(result.outcome).toBe('threshold_crossed');
    expect(result.notified_user_ids).toEqual([RECIPIENT_USER_ID]);
    expect(state.notificationsCreated).toHaveLength(1);
    expect(state.alertRunsCreated[0]!.notified_user_ids).toEqual([RECIPIENT_USER_ID]);
    expect(state.alertUpdates[0]!.data.last_triggered_at).toBeInstanceOf(Date);
  });

  it('suppresses dispatch under anti-spam (still records the run)', async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const { tx, state } = buildMockTx({
      invoiceCount: 10,
      membershipUserIds: [RECIPIENT_USER_ID],
      recentRuns: [{ outcome: 'threshold_crossed', evaluated_at: tenMinAgo }],
    });
    const alert = buildAlert({
      threshold: { toString: () => '5' } as unknown as Prisma.Decimal,
    });
    const result = await evaluateAlert(tx, TENANT_ID, alert);
    expect(result.outcome).toBe('threshold_crossed');
    expect(result.notified_user_ids).toEqual([]);
    expect(state.notificationsCreated).toHaveLength(0);
    expect(state.alertUpdates[0]!.data.last_triggered_at).toBeUndefined();
  });

  it('writes outcome=error when the metric key is unknown', async () => {
    const { tx, state } = buildMockTx();
    const alert = buildAlert({ metric: 'not_a_real_metric' });
    const result = await evaluateAlert(tx, TENANT_ID, alert);
    expect(result.outcome).toBe('error');
    expect(result.error_message).toContain('Unknown metric key');
    expect(state.alertRunsCreated[0]!.outcome).toBe('error');
  });

  it('writes outcome=error when the calculator throws', async () => {
    const { tx, state } = buildMockTx();
    (tx.invoice.count as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const alert = buildAlert();
    const result = await evaluateAlert(tx, TENANT_ID, alert);
    expect(result.outcome).toBe('error');
    expect(result.error_message).toBe('boom');
    expect(state.alertRunsCreated[0]!.outcome).toBe('error');
  });
});

describe('evaluateTenant', () => {
  it('iterates every active alert and aggregates the result', async () => {
    const alertA = buildAlert({ id: 'aaaa1111-1111-1111-1111-111111111111' });
    const alertB = buildAlert({
      id: 'bbbb2222-2222-2222-2222-222222222222',
      threshold: { toString: () => '50' } as unknown as Prisma.Decimal,
    });
    const { tx } = buildMockTx({
      invoiceCount: 10,
      membershipUserIds: [RECIPIENT_USER_ID],
      alerts: [alertA, alertB],
    });
    const result = await evaluateTenant(tx, TENANT_ID);
    expect(result.evaluated).toBe(2);
    expect(result.fired).toBe(1);
    expect(result.errored).toBe(0);
  });

  it('returns 0/0/0 when there are no active alerts', async () => {
    const { tx } = buildMockTx({ alerts: [] });
    const result = await evaluateTenant(tx, TENANT_ID);
    expect(result.evaluated).toBe(0);
  });
});
