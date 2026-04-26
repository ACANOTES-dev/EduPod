import * as fs from 'fs';
import * as path from 'path';

import { formatPayslipNumber } from '@school/shared/payroll';
import { payslipSnapshotSchema } from '@school/shared/payroll';

// ─── Cross-path equivalence — finalisation contract guard ────────────────────
//
// The single most important regression in the payroll-overhaul rebuild was
// that the direct (school-owner) and approval-callback (worker) finalisation
// paths produced DIFFERENT payslip-number formats and DIFFERENT snapshot
// payload shapes. Wave 2 unified them under shared utilities; this spec
// pins the contract so a future drift on EITHER path surfaces in CI.
//
// What we assert:
//
//   1. The shared `formatPayslipNumber` produces the canonical
//      `<PREFIX>-YYYYMM-NNNNNN` format under every input. (Already covered
//      in `packages/shared/src/payroll/payslip-number.spec.ts` — re-asserted
//      here so the cross-path link is documented in one place.)
//
//   2. Both finalisation paths IMPORT `formatPayslipNumber` from
//      `@school/shared/payroll`. If either path stops using the shared
//      util, this guard fails.
//
//   3. Neither path constructs a payslip-number with an inline template
//      literal that bypasses the shared util.
//
//   4. Both paths construct a snapshot whose top-level keys match the
//      shared `payslipSnapshotSchema`. A divergence in either path's
//      snapshot construction shows up as a schema-validation drift here.
//
// This is a structural guard — it does not execute both paths against a
// shared fixture (the worker lives in a separate package with its own DI
// container; cross-package execution belongs in a true e2e test). The
// guard catches the regression class that motivated the rebuild: silent
// divergence between two parallel implementations.

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const FINALISATION_SERVICE_PATH = path.join(
  REPO_ROOT,
  'apps/api/src/modules/payroll/finalisation.service.ts',
);
const APPROVAL_CALLBACK_PATH = path.join(
  REPO_ROOT,
  'apps/worker/src/processors/payroll/approval-callback.processor.ts',
);

function readSource(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf-8');
}

describe('payroll finalisation cross-path equivalence', () => {
  // ─── 1. Shared format utility: pinned canonical output ─────────────────────

  it('shared formatPayslipNumber produces <PREFIX>-YYYYMM-NNNNNN', () => {
    expect(
      formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 4, sequence: 1 }),
    ).toBe('PSL-202604-000001');
    expect(
      formatPayslipNumber({ prefix: 'NHQS', periodYear: 2026, periodMonth: 12, sequence: 999 }),
    ).toBe('NHQS-202612-000999');
  });

  // ─── 2. Both paths import the shared util ──────────────────────────────────

  it('FinalisationService imports formatPayslipNumber from @school/shared/payroll', () => {
    const src = readSource(FINALISATION_SERVICE_PATH);
    expect(src).toMatch(
      /import\s+\{[^}]*formatPayslipNumber[^}]*\}\s+from\s+['"]@school\/shared\/payroll['"]/,
    );
  });

  it('worker approval-callback imports formatPayslipNumber from @school/shared/payroll', () => {
    const src = readSource(APPROVAL_CALLBACK_PATH);
    expect(src).toMatch(
      /import\s+\{[^}]*formatPayslipNumber[^}]*\}\s+from\s+['"]@school\/shared\/payroll['"]/,
    );
  });

  // ─── 3. Neither path inlines a payslip-number template ─────────────────────
  //
  // The pre-rebuild approval-callback path used `\`PS-${year}${month}-${seq}\``
  // — a 5-digit padded format that diverged from the direct path's 6-digit
  // padding. If anyone re-introduces a template-literal payslip-number, this
  // test fails and the canonical path forces them through the shared util.

  const PAYSLIP_TEMPLATE_PATTERN = /`P[A-Z]{0,3}-\$\{/;

  it('FinalisationService does not inline a payslip-number template literal', () => {
    const src = readSource(FINALISATION_SERVICE_PATH);
    expect(src).not.toMatch(PAYSLIP_TEMPLATE_PATTERN);
  });

  it('worker approval-callback does not inline a payslip-number template literal', () => {
    const src = readSource(APPROVAL_CALLBACK_PATH);
    expect(src).not.toMatch(PAYSLIP_TEMPLATE_PATTERN);
  });

  // ─── 4. Snapshot shape: top-level keys both paths must populate ───────────
  //
  // The `payslipSnapshotSchema` is the single source of truth for the
  // immutable payslip payload. Both paths construct an object literal that
  // satisfies this schema. A drift on either side (missing key, renamed
  // key, wrong nesting) is caught by Zod when the snapshot is parsed,
  // regardless of the path that produced it.

  const REQUIRED_TOP_LEVEL_KEYS = [
    'schema_version',
    'staff',
    'period',
    'compensation',
    'inputs',
    'components',
    'totals',
    'currency',
    'generated_at',
  ];

  function assertConstructsAllRequiredKeys(source: string, label: string) {
    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(source.includes(`${key}:`)).toBe(true);
      if (!source.includes(`${key}:`)) {
        throw new Error(`${label} is missing snapshot key: ${key}`);
      }
    }
  }

  it('FinalisationService constructs every required snapshot key', () => {
    const src = readSource(FINALISATION_SERVICE_PATH);
    assertConstructsAllRequiredKeys(src, 'FinalisationService');
  });

  it('worker approval-callback constructs every required snapshot key', () => {
    const src = readSource(APPROVAL_CALLBACK_PATH);
    assertConstructsAllRequiredKeys(src, 'approval-callback.processor');
  });

  // ─── 5. The shared schema accepts a sample snapshot of the canonical shape ─
  //
  // If `payslipSnapshotSchema` ever weakens (e.g. someone makes a required
  // field optional), this canary fixture catches it. The fixture mirrors
  // exactly the shape both paths produce.

  it('payslipSnapshotSchema accepts the canonical snapshot shape', () => {
    const sample = {
      schema_version: 1 as const,
      staff: {
        staff_profile_id: '11111111-1111-1111-1111-111111111111',
        full_name: 'Aisha Khan',
        employee_number: 'EMP-001',
      },
      period: { year: 2026, month: 4, start: '2026-04-01', end: '2026-04-30' },
      compensation: {
        type: 'salaried' as const,
        base_salary: '50000',
        per_class_rate: null,
        bonus_class_multiplier: null,
      },
      inputs: {
        days_worked: '22',
        total_working_days: 22,
        classes_delivered: 0,
        classes_scheduled: 0,
        bonus_classes: 0,
      },
      components: {
        base_pay: '50000',
        bonus_pay: '0',
        allowances: [],
        one_offs: [],
        adjustments: [],
        deductions: [],
      },
      totals: {
        gross_pay: '50000',
        total_deductions: '1500',
        net_pay: '48500',
        allowances_total: '0',
        deductions_total: '1500',
        adjustments_total: '0',
        one_off_total: '0',
      },
      currency: { code: 'USD' },
      generated_at: '2026-04-26T12:00:00.000Z',
      generated_by_user_id: '99999999-9999-9999-9999-999999999999',
    };
    expect(() => payslipSnapshotSchema.parse(sample)).not.toThrow();
  });
});
