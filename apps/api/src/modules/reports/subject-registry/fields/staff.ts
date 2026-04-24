import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'staff.identity.staff_number',
    label_key: 'reports.fields.staff.identity.staff_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'staff_number',
  },
  {
    id: 'staff.identity.job_title',
    label_key: 'reports.fields.staff.identity.job_title',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'job_title',
  },
  {
    id: 'staff.identity.email',
    label_key: 'reports.fields.staff.identity.email',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'user_email',
  },
  {
    id: 'staff.identity.full_name',
    label_key: 'reports.fields.staff.identity.full_name',
    domain: 'identity',
    type: 'string',
    filterable: false,
    groupable: false,
    resolver: 'user_full_name',
  },

  {
    id: 'staff.employment.status',
    label_key: 'reports.fields.staff.employment.status',
    domain: 'employment',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['active', 'inactive'],
    resolver: 'employment_status',
  },
  {
    id: 'staff.employment.type',
    label_key: 'reports.fields.staff.employment.type',
    domain: 'employment',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['full_time', 'part_time', 'contract', 'substitute'],
    resolver: 'employment_type',
  },
  {
    id: 'staff.employment.department',
    label_key: 'reports.fields.staff.employment.department',
    domain: 'employment',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'department',
  },

  {
    id: 'staff.audit.created_at',
    label_key: 'reports.fields.staff.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
  {
    id: 'staff.audit.updated_at',
    label_key: 'reports.fields.staff.audit.updated_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'updated_at',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'staff',
  label_key: 'reports.subjects.staff.label',
  icon_name: 'Users',
  primary_model: 'StaffProfile',
  fields,
};

type StaffRow = {
  id: string;
  staff_number: string | null;
  job_title: string | null;
  employment_status: string;
  employment_type: string;
  department: string | null;
  created_at: Date;
  updated_at: Date;
  user: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const STAFF_ADAPTER: SubjectAdapter = buildAdapter<StaffRow>({
  descriptor,
  filterColumnMap: {
    'staff.identity.staff_number': 'staff_number',
    'staff.identity.job_title': 'job_title',
    'staff.identity.email': 'user.email',
    'staff.employment.status': 'employment_status',
    'staff.employment.type': 'employment_type',
    'staff.employment.department': 'department',
    'staff.audit.created_at': 'created_at',
    'staff.audit.updated_at': 'updated_at',
  },
  selectFragment: {
    id: true,
    staff_number: true,
    job_title: true,
    employment_status: true,
    employment_type: true,
    department: true,
    created_at: true,
    updated_at: true,
    user: { select: { id: true, email: true, first_name: true, last_name: true } },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.staffProfile as unknown as PrismaDelegate,
  resolvers: {
    staff_number: (r) => r.staff_number,
    job_title: (r) => r.job_title,
    user_email: (r) => r.user?.email ?? null,
    user_full_name: (r) => {
      if (!r.user) return null;
      return `${r.user.first_name ?? ''} ${r.user.last_name ?? ''}`.trim() || null;
    },
    employment_status: (r) => r.employment_status,
    employment_type: (r) => r.employment_type,
    department: (r) => r.department,
    created_at: (r) => r.created_at,
    updated_at: (r) => r.updated_at,
  },
});
