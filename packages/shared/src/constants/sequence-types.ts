export const SEQUENCE_TYPES = [
  'receipt',
  'invoice',
  'application',
  'payslip',
] as const;

export type SequenceType = (typeof SEQUENCE_TYPES)[number];
