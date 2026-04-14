/**
 * Default leave type catalogue — seeded with tenant_id = NULL so all tenants
 * share the same base rows. Tenants may override by creating their own rows
 * with the same code (the partial unique indexes keep system + tenant rows
 * distinct).
 */

export interface LeaveTypeSeed {
  code: string;
  label: string;
  requires_approval: boolean;
  is_paid_default: boolean;
  max_days_per_request: number | null;
  requires_evidence: boolean;
  display_order: number;
}

export const LEAVE_TYPE_SEEDS: LeaveTypeSeed[] = [
  {
    code: 'sick',
    label: 'Sick Leave',
    requires_approval: false,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: false,
    display_order: 10,
  },
  {
    code: 'annual',
    label: 'Annual Leave',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: false,
    display_order: 20,
  },
  {
    code: 'bereavement',
    label: 'Bereavement Leave',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: 5,
    requires_evidence: false,
    display_order: 30,
  },
  {
    code: 'maternity',
    label: 'Maternity Leave',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: true,
    display_order: 40,
  },
  {
    code: 'paternity',
    label: 'Paternity Leave',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: true,
    display_order: 50,
  },
  {
    code: 'unpaid_personal',
    label: 'Unpaid Personal Leave',
    requires_approval: true,
    is_paid_default: false,
    max_days_per_request: null,
    requires_evidence: false,
    display_order: 60,
  },
  {
    code: 'jury_duty',
    label: 'Jury Duty',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: true,
    display_order: 70,
  },
  {
    code: 'medical_appointment',
    label: 'Medical Appointment',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: 1,
    requires_evidence: false,
    display_order: 80,
  },
  {
    code: 'toil',
    label: 'Time Off in Lieu',
    requires_approval: true,
    is_paid_default: true,
    max_days_per_request: null,
    requires_evidence: false,
    display_order: 90,
  },
];
