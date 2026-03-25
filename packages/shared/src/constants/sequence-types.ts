export const SEQUENCE_TYPES = [
  'receipt',
  'invoice',
  'application',
  'payslip',
  'student',
  'staff',
  'household',
  'payment',
] as const;

export type SequenceType = (typeof SEQUENCE_TYPES)[number];
