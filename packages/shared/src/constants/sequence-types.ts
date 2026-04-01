export const SEQUENCE_TYPES = [
  'receipt',
  'invoice',
  'application',
  'payslip',
  'student',
  'staff',
  'household',
  'payment',
  'refund',
  'sen_support_plan',
  'behaviour_incident',
  'behaviour_sanction',
  'behaviour_intervention',
  'safeguarding_concern',
  'behaviour_appeal',
  'behaviour_exclusion',
] as const;

export type SequenceType = (typeof SEQUENCE_TYPES)[number];
