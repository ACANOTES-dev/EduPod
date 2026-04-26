import { payslipSnapshotSchema, type PayslipSnapshot } from './payslip-snapshot.schema';

const STAFF_ID = '11111111-1111-1111-1111-111111111111';
const ALLOWANCE_ID = '22222222-2222-2222-2222-222222222222';
const DEDUCTION_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const buildValidSnapshot = (): PayslipSnapshot => ({
  schema_version: 1,
  staff: {
    staff_profile_id: STAFF_ID,
    full_name: 'Aisha Khan',
    employee_number: 'EMP-0042',
  },
  period: {
    year: 2026,
    month: 4,
    start: '2026-04-01',
    end: '2026-04-30',
  },
  compensation: {
    type: 'salaried',
    base_salary: '5000.00',
    per_class_rate: null,
    bonus_class_multiplier: null,
  },
  inputs: {
    days_worked: '20.5',
    total_working_days: 22,
    classes_delivered: 0,
    classes_scheduled: 0,
    bonus_classes: 0,
  },
  components: {
    base_pay: '4659.09',
    bonus_pay: '0.00',
    allowances: [{ allowance_type_id: ALLOWANCE_ID, label: 'Transport', amount: '200.00' }],
    one_offs: [],
    adjustments: [],
    deductions: [
      {
        staff_recurring_deduction_id: DEDUCTION_ID,
        label: 'Salary advance repayment',
        amount: '300.00',
        remaining_after: '600.00',
      },
    ],
  },
  totals: {
    gross_pay: '4859.09',
    total_deductions: '300.00',
    net_pay: '4559.09',
    allowances_total: '200.00',
    deductions_total: '300.00',
    adjustments_total: '0.00',
    one_off_total: '0.00',
  },
  currency: { code: 'USD' },
  generated_at: '2026-04-30T18:00:00.000Z',
  generated_by_user_id: USER_ID,
});

describe('payslipSnapshotSchema', () => {
  it('accepts a valid snapshot through round-trip parsing', () => {
    const snapshot = buildValidSnapshot();
    const parsed = payslipSnapshotSchema.parse(snapshot);
    expect(parsed.totals.net_pay).toBe('4559.09');
    expect(parsed.components.allowances).toHaveLength(1);
  });

  it('rejects a snapshot missing totals.gross_pay', () => {
    const snapshot = buildValidSnapshot() as unknown as Record<string, unknown>;
    delete (snapshot.totals as Record<string, unknown>).gross_pay;
    expect(() => payslipSnapshotSchema.parse(snapshot)).toThrow(/gross_pay/);
  });

  it('rejects a wrong currency code length', () => {
    const snapshot = buildValidSnapshot();
    snapshot.currency.code = 'USDT';
    expect(() => payslipSnapshotSchema.parse(snapshot)).toThrow();
  });

  it('rejects schema_version other than 1', () => {
    const snapshot = buildValidSnapshot() as unknown as Record<string, unknown>;
    snapshot.schema_version = 2;
    expect(() => payslipSnapshotSchema.parse(snapshot)).toThrow();
  });

  it('defaults bonus_classes to 0 when omitted', () => {
    const snapshot = buildValidSnapshot() as unknown as Record<string, unknown>;
    delete (snapshot.inputs as Record<string, unknown>).bonus_classes;
    const parsed = payslipSnapshotSchema.parse(snapshot);
    expect(parsed.inputs.bonus_classes).toBe(0);
  });
});
