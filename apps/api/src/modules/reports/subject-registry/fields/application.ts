import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'application.identity.application_number',
    label_key: 'reports.fields.application.identity.application_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'application_number',
  },
  {
    id: 'application.identity.student_first_name',
    label_key: 'reports.fields.application.identity.student_first_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_first_name',
  },
  {
    id: 'application.identity.student_last_name',
    label_key: 'reports.fields.application.identity.student_last_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_last_name',
  },
  {
    id: 'application.identity.date_of_birth',
    label_key: 'reports.fields.application.identity.date_of_birth',
    domain: 'identity',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'date_of_birth',
  },
  {
    id: 'application.status.status',
    label_key: 'reports.fields.application.status.status',
    domain: 'status',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: [
      'submitted',
      'waiting_list',
      'ready_to_admit',
      'conditional_approval',
      'approved',
      'rejected',
      'withdrawn',
    ],
    resolver: 'status',
  },
  {
    id: 'application.status.payment_status',
    label_key: 'reports.fields.application.status.payment_status',
    domain: 'status',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'payment_status',
  },
  {
    id: 'application.timing.submitted_at',
    label_key: 'reports.fields.application.timing.submitted_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'submitted_at',
  },
  {
    id: 'application.timing.reviewed_at',
    label_key: 'reports.fields.application.timing.reviewed_at',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'reviewed_at',
  },
  {
    id: 'application.timing.apply_date',
    label_key: 'reports.fields.application.timing.apply_date',
    domain: 'timing',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'apply_date',
  },
  {
    id: 'application.target.year_group_name',
    label_key: 'reports.fields.application.target.year_group_name',
    domain: 'target',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'target_year_group_name',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'application',
  label_key: 'reports.subjects.application.label',
  icon_name: 'FileText',
  primary_model: 'Application',
  fields,
};

type ApplicationRow = {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  status: string;
  payment_status: string;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  apply_date: Date;
  target_year_group: { id: string; name: string } | null;
};

export const APPLICATION_ADAPTER: SubjectAdapter = buildAdapter<ApplicationRow>({
  descriptor,
  filterColumnMap: {
    'application.identity.application_number': 'application_number',
    'application.identity.student_first_name': 'student_first_name',
    'application.identity.student_last_name': 'student_last_name',
    'application.identity.date_of_birth': 'date_of_birth',
    'application.status.status': 'status',
    'application.status.payment_status': 'payment_status',
    'application.timing.submitted_at': 'submitted_at',
    'application.timing.reviewed_at': 'reviewed_at',
    'application.timing.apply_date': 'apply_date',
    'application.target.year_group_name': 'target_year_group.name',
  },
  selectFragment: {
    id: true,
    application_number: true,
    student_first_name: true,
    student_last_name: true,
    date_of_birth: true,
    status: true,
    payment_status: true,
    submitted_at: true,
    reviewed_at: true,
    apply_date: true,
    target_year_group: { select: { id: true, name: true } },
  },
  defaultOrderBy: [{ apply_date: 'desc' }],
  getDelegate: (tx) => tx.application as unknown as PrismaDelegate,
  resolvers: {
    application_number: (r) => r.application_number,
    student_first_name: (r) => r.student_first_name,
    student_last_name: (r) => r.student_last_name,
    date_of_birth: (r) => r.date_of_birth,
    status: (r) => r.status,
    payment_status: (r) => r.payment_status,
    submitted_at: (r) => r.submitted_at,
    reviewed_at: (r) => r.reviewed_at,
    apply_date: (r) => r.apply_date,
    target_year_group_name: (r) => r.target_year_group?.name ?? null,
  },
});
