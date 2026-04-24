import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'payroll_entry.identity.compensation_type',
    label_key: 'reports.fields.payroll_entry.identity.compensation_type',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'compensation_type',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.amounts.basic_pay',
    label_key: 'reports.fields.payroll_entry.amounts.basic_pay',
    domain: 'amounts',
    type: 'currency',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'basic_pay',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.amounts.bonus_pay',
    label_key: 'reports.fields.payroll_entry.amounts.bonus_pay',
    domain: 'amounts',
    type: 'currency',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'bonus_pay',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.amounts.total_pay',
    label_key: 'reports.fields.payroll_entry.amounts.total_pay',
    domain: 'amounts',
    type: 'currency',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'total_pay',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.days.days_worked',
    label_key: 'reports.fields.payroll_entry.days.days_worked',
    domain: 'days',
    type: 'number',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'days_worked',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.days.classes_taught',
    label_key: 'reports.fields.payroll_entry.days.classes_taught',
    domain: 'days',
    type: 'number',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'classes_taught',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.staff.job_title',
    label_key: 'reports.fields.payroll_entry.staff.job_title',
    domain: 'staff',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'staff_job_title',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.staff.department',
    label_key: 'reports.fields.payroll_entry.staff.department',
    domain: 'staff',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'staff_department',
    permission: 'payroll.view',
  },
  {
    id: 'payroll_entry.audit.created_at',
    label_key: 'reports.fields.payroll_entry.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
    permission: 'payroll.view',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'payroll_entry',
  label_key: 'reports.subjects.payroll_entry.label',
  icon_name: 'Wallet',
  primary_model: 'PayrollEntry',
  fields,
};

type PayrollEntryRow = {
  id: string;
  compensation_type: string;
  basic_pay: unknown;
  bonus_pay: unknown;
  total_pay: unknown;
  days_worked: number | null;
  classes_taught: number | null;
  created_at: Date;
  staff_profile: { id: string; job_title: string | null; department: string | null } | null;
};

export const PAYROLL_ENTRY_ADAPTER: SubjectAdapter = buildAdapter<PayrollEntryRow>({
  descriptor,
  filterColumnMap: {
    'payroll_entry.identity.compensation_type': 'compensation_type',
    'payroll_entry.amounts.basic_pay': 'basic_pay',
    'payroll_entry.amounts.bonus_pay': 'bonus_pay',
    'payroll_entry.amounts.total_pay': 'total_pay',
    'payroll_entry.days.days_worked': 'days_worked',
    'payroll_entry.days.classes_taught': 'classes_taught',
    'payroll_entry.staff.job_title': 'staff_profile.job_title',
    'payroll_entry.staff.department': 'staff_profile.department',
    'payroll_entry.audit.created_at': 'created_at',
  },
  selectFragment: {
    id: true,
    compensation_type: true,
    basic_pay: true,
    bonus_pay: true,
    total_pay: true,
    days_worked: true,
    classes_taught: true,
    created_at: true,
    staff_profile: { select: { id: true, job_title: true, department: true } },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.payrollEntry as unknown as PrismaDelegate,
  resolvers: {
    compensation_type: (r) => r.compensation_type,
    basic_pay: (r) => normaliseDecimal(r.basic_pay),
    bonus_pay: (r) => normaliseDecimal(r.bonus_pay),
    total_pay: (r) => normaliseDecimal(r.total_pay),
    days_worked: (r) => r.days_worked,
    classes_taught: (r) => r.classes_taught,
    staff_job_title: (r) => r.staff_profile?.job_title ?? null,
    staff_department: (r) => r.staff_profile?.department ?? null,
    created_at: (r) => r.created_at,
  },
});

function normaliseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const asString = (value as { toString: () => string }).toString?.();
  if (typeof asString === 'string') {
    const parsed = Number(asString);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
