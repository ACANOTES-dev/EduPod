import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'class.identity.name',
    label_key: 'reports.fields.class.identity.name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'name',
  },
  {
    id: 'class.identity.max_capacity',
    label_key: 'reports.fields.class.identity.max_capacity',
    domain: 'identity',
    type: 'number',
    filterable: true,
    groupable: true,
    aggregations: ['count', 'avg', 'min', 'max', 'sum'],
    resolver: 'max_capacity',
  },
  {
    id: 'class.identity.status',
    label_key: 'reports.fields.class.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['active', 'inactive', 'archived'],
    resolver: 'status',
  },
  {
    id: 'class.academic.year_group_name',
    label_key: 'reports.fields.class.academic.year_group_name',
    domain: 'academic',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'year_group_name',
  },
  {
    id: 'class.academic.subject_name',
    label_key: 'reports.fields.class.academic.subject_name',
    domain: 'academic',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'subject_name',
  },
  {
    id: 'class.academic.academic_year',
    label_key: 'reports.fields.class.academic.academic_year',
    domain: 'academic',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'academic_year_name',
  },
  {
    id: 'class.staff.homeroom_teacher',
    label_key: 'reports.fields.class.staff.homeroom_teacher',
    domain: 'staff',
    type: 'string',
    filterable: false,
    groupable: false,
    resolver: 'homeroom_teacher_name',
  },
  {
    id: 'class.audit.created_at',
    label_key: 'reports.fields.class.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
  {
    id: 'class.audit.updated_at',
    label_key: 'reports.fields.class.audit.updated_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'updated_at',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'class',
  label_key: 'reports.subjects.class.label',
  icon_name: 'BookOpen',
  primary_model: 'Class',
  fields,
};

type ClassRow = {
  id: string;
  name: string;
  max_capacity: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  year_group: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  academic_year: { id: string; name: string } | null;
  homeroom_teacher: {
    id: string;
    user: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

export const CLASS_ADAPTER: SubjectAdapter = buildAdapter<ClassRow>({
  descriptor,
  filterColumnMap: {
    'class.identity.name': 'name',
    'class.identity.max_capacity': 'max_capacity',
    'class.identity.status': 'status',
    'class.academic.year_group_name': 'year_group.name',
    'class.academic.subject_name': 'subject.name',
    'class.academic.academic_year': 'academic_year.name',
    'class.audit.created_at': 'created_at',
    'class.audit.updated_at': 'updated_at',
  },
  selectFragment: {
    id: true,
    name: true,
    max_capacity: true,
    status: true,
    created_at: true,
    updated_at: true,
    year_group: { select: { id: true, name: true } },
    subject: { select: { id: true, name: true } },
    academic_year: { select: { id: true, name: true } },
    homeroom_teacher: {
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.class as unknown as PrismaDelegate,
  resolvers: {
    name: (r) => r.name,
    max_capacity: (r) => r.max_capacity,
    status: (r) => r.status,
    created_at: (r) => r.created_at,
    updated_at: (r) => r.updated_at,
    year_group_name: (r) => r.year_group?.name ?? null,
    subject_name: (r) => r.subject?.name ?? null,
    academic_year_name: (r) => r.academic_year?.name ?? null,
    homeroom_teacher_name: (r) => {
      const u = r.homeroom_teacher?.user;
      if (!u) return null;
      return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null;
    },
  },
});
