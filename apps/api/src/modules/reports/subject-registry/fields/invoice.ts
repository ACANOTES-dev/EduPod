import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'invoice.identity.invoice_number',
    label_key: 'reports.fields.invoice.identity.invoice_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'invoice_number',
    permission: 'finance.view',
  },
  {
    id: 'invoice.identity.status',
    label_key: 'reports.fields.invoice.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: [
      'draft',
      'pending_approval',
      'issued',
      'partially_paid',
      'paid',
      'overdue',
      'void',
      'cancelled',
      'written_off',
    ],
    resolver: 'status',
    permission: 'finance.view',
  },
  {
    id: 'invoice.amounts.total_amount',
    label_key: 'reports.fields.invoice.amounts.total_amount',
    domain: 'amounts',
    type: 'currency',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'total_amount',
    permission: 'finance.view',
  },
  {
    id: 'invoice.amounts.balance_amount',
    label_key: 'reports.fields.invoice.amounts.balance_amount',
    domain: 'amounts',
    type: 'currency',
    filterable: true,
    groupable: false,
    aggregations: ['count', 'sum', 'avg', 'min', 'max'],
    resolver: 'balance_amount',
    permission: 'finance.view',
  },
  {
    id: 'invoice.dates.issue_date',
    label_key: 'reports.fields.invoice.dates.issue_date',
    domain: 'dates',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'issue_date',
    permission: 'finance.view',
  },
  {
    id: 'invoice.dates.due_date',
    label_key: 'reports.fields.invoice.dates.due_date',
    domain: 'dates',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'due_date',
    permission: 'finance.view',
  },
  {
    id: 'invoice.household.household_name',
    label_key: 'reports.fields.invoice.household.household_name',
    domain: 'household',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'household_name',
    permission: 'finance.view',
  },
  {
    id: 'invoice.audit.created_at',
    label_key: 'reports.fields.invoice.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
    permission: 'finance.view',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'invoice',
  label_key: 'reports.subjects.invoice.label',
  icon_name: 'FileText',
  primary_model: 'Invoice',
  fields,
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: unknown;
  balance_amount: unknown;
  issue_date: Date | null;
  due_date: Date | null;
  created_at: Date;
  household: { id: string; household_name: string } | null;
};

export const INVOICE_ADAPTER: SubjectAdapter = buildAdapter<InvoiceRow>({
  descriptor,
  filterColumnMap: {
    'invoice.identity.invoice_number': 'invoice_number',
    'invoice.identity.status': 'status',
    'invoice.amounts.total_amount': 'total_amount',
    'invoice.amounts.balance_amount': 'balance_amount',
    'invoice.dates.issue_date': 'issue_date',
    'invoice.dates.due_date': 'due_date',
    'invoice.household.household_name': 'household.household_name',
    'invoice.audit.created_at': 'created_at',
  },
  selectFragment: {
    id: true,
    invoice_number: true,
    status: true,
    total_amount: true,
    balance_amount: true,
    issue_date: true,
    due_date: true,
    created_at: true,
    household: { select: { id: true, household_name: true } },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.invoice as unknown as PrismaDelegate,
  resolvers: {
    invoice_number: (r) => r.invoice_number,
    status: (r) => r.status,
    total_amount: (r) => normaliseDecimal(r.total_amount),
    balance_amount: (r) => normaliseDecimal(r.balance_amount),
    issue_date: (r) => r.issue_date,
    due_date: (r) => r.due_date,
    household_name: (r) => r.household?.household_name ?? null,
    created_at: (r) => r.created_at,
  },
});

/**
 * Prisma returns `Decimal` for `@db.Decimal(12,2)` columns. Our API layer
 * returns numbers. Coerce via `Number()` — invoice totals fit comfortably
 * inside JS's safe integer range at cents resolution.
 */
function normaliseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  // Prisma Decimal
  const asString = (value as { toString: () => string }).toString?.();
  if (typeof asString === 'string') {
    const parsed = Number(asString);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
