import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

// The enum values below are the Prisma enum names after `@map` re-keying
// — safeguarding statuses have a `sg_` prefix in the TypeScript enum
// because their underlying SQL labels ('resolved', 'monitoring') collide
// with the Behaviour enum. Prisma's generated client exposes the prefixed
// names; the SQL layer stores the unprefixed form. For filter-picker UX
// the builder UI will show the translated labels regardless.
const fields: readonly FieldDescriptor[] = [
  {
    id: 'safeguarding_concern.identity.concern_number',
    label_key: 'reports.fields.safeguarding_concern.identity.concern_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'concern_number',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.identity.concern_type',
    label_key: 'reports.fields.safeguarding_concern.identity.concern_type',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: [
      'physical_abuse',
      'emotional_abuse',
      'sexual_abuse',
      'neglect',
      'self_harm',
      'bullying',
      'online_safety',
      'domestic_violence',
      'substance_abuse',
      'mental_health',
      'radicalisation',
      'other_concern',
    ],
    resolver: 'concern_type',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.identity.severity',
    label_key: 'reports.fields.safeguarding_concern.identity.severity',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['low_sev', 'medium_sev', 'high_sev', 'critical_sev'],
    resolver: 'severity',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.identity.status',
    label_key: 'reports.fields.safeguarding_concern.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: [
      'reported',
      'acknowledged',
      'under_investigation',
      'referred',
      'sg_monitoring',
      'sg_resolved',
      'sealed',
    ],
    resolver: 'status',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.referrals.is_tusla_referral',
    label_key: 'reports.fields.safeguarding_concern.referrals.is_tusla_referral',
    domain: 'referrals',
    type: 'boolean',
    filterable: true,
    groupable: true,
    resolver: 'is_tusla_referral',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.referrals.is_garda_referral',
    label_key: 'reports.fields.safeguarding_concern.referrals.is_garda_referral',
    domain: 'referrals',
    type: 'boolean',
    filterable: true,
    groupable: true,
    resolver: 'is_garda_referral',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.student.student_first_name',
    label_key: 'reports.fields.safeguarding_concern.student.student_first_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_first_name',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.student.student_last_name',
    label_key: 'reports.fields.safeguarding_concern.student.student_last_name',
    domain: 'student',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_last_name',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.timing.created_at',
    label_key: 'reports.fields.safeguarding_concern.timing.created_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
    permission: 'safeguarding.view',
  },
  {
    id: 'safeguarding_concern.timing.resolved_at',
    label_key: 'reports.fields.safeguarding_concern.timing.resolved_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'resolved_at',
    permission: 'safeguarding.view',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'safeguarding_concern',
  label_key: 'reports.subjects.safeguarding_concern.label',
  icon_name: 'Shield',
  primary_model: 'SafeguardingConcern',
  fields,
};

type SafeguardingConcernRow = {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  is_tusla_referral: boolean;
  is_garda_referral: boolean;
  created_at: Date;
  resolved_at: Date | null;
  student: { id: string; first_name: string; last_name: string } | null;
};

export const SAFEGUARDING_CONCERN_ADAPTER: SubjectAdapter = buildAdapter<SafeguardingConcernRow>({
  descriptor,
  filterColumnMap: {
    'safeguarding_concern.identity.concern_number': 'concern_number',
    'safeguarding_concern.identity.concern_type': 'concern_type',
    'safeguarding_concern.identity.severity': 'severity',
    'safeguarding_concern.identity.status': 'status',
    'safeguarding_concern.referrals.is_tusla_referral': 'is_tusla_referral',
    'safeguarding_concern.referrals.is_garda_referral': 'is_garda_referral',
    'safeguarding_concern.student.student_first_name': 'student.first_name',
    'safeguarding_concern.student.student_last_name': 'student.last_name',
    'safeguarding_concern.timing.created_at': 'created_at',
    'safeguarding_concern.timing.resolved_at': 'resolved_at',
  },
  selectFragment: {
    id: true,
    concern_number: true,
    concern_type: true,
    severity: true,
    status: true,
    is_tusla_referral: true,
    is_garda_referral: true,
    created_at: true,
    resolved_at: true,
    student: { select: { id: true, first_name: true, last_name: true } },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.safeguardingConcern as unknown as PrismaDelegate,
  resolvers: {
    concern_number: (r) => r.concern_number,
    concern_type: (r) => r.concern_type,
    severity: (r) => r.severity,
    status: (r) => r.status,
    is_tusla_referral: (r) => r.is_tusla_referral,
    is_garda_referral: (r) => r.is_garda_referral,
    student_first_name: (r) => r.student?.first_name ?? null,
    student_last_name: (r) => r.student?.last_name ?? null,
    created_at: (r) => r.created_at,
    resolved_at: (r) => r.resolved_at,
  },
});
