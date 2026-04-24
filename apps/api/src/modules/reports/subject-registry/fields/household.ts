import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

const fields: readonly FieldDescriptor[] = [
  {
    id: 'household.identity.household_name',
    label_key: 'reports.fields.household.identity.household_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'household_name',
  },
  {
    id: 'household.identity.household_number',
    label_key: 'reports.fields.household.identity.household_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'household_number',
  },
  {
    id: 'household.identity.status',
    label_key: 'reports.fields.household.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['active', 'inactive', 'archived'],
    resolver: 'status',
  },
  {
    id: 'household.identity.children_count',
    label_key: 'reports.fields.household.identity.children_count',
    domain: 'identity',
    type: 'number',
    filterable: true,
    groupable: true,
    aggregations: ['count', 'avg', 'min', 'max', 'sum'],
    resolver: 'student_counter',
  },
  {
    id: 'household.address.city',
    label_key: 'reports.fields.household.address.city',
    domain: 'address',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'city',
  },
  {
    id: 'household.address.country',
    label_key: 'reports.fields.household.address.country',
    domain: 'address',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'country',
  },
  {
    id: 'household.address.postal_code',
    label_key: 'reports.fields.household.address.postal_code',
    domain: 'address',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'postal_code',
  },
  {
    id: 'household.address.address_line_1',
    label_key: 'reports.fields.household.address.address_line_1',
    domain: 'address',
    type: 'string',
    filterable: false,
    groupable: false,
    resolver: 'address_line_1',
  },
  {
    id: 'household.audit.created_at',
    label_key: 'reports.fields.household.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
  {
    id: 'household.audit.updated_at',
    label_key: 'reports.fields.household.audit.updated_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'updated_at',
  },
];

const descriptor: SubjectDescriptor = {
  key: 'household',
  label_key: 'reports.subjects.household.label',
  icon_name: 'Home',
  primary_model: 'Household',
  fields,
};

type HouseholdRow = {
  id: string;
  household_name: string;
  household_number: string | null;
  status: string;
  student_counter: number;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  address_line_1: string | null;
  created_at: Date;
  updated_at: Date;
};

export const HOUSEHOLD_ADAPTER: SubjectAdapter = buildAdapter<HouseholdRow>({
  descriptor,
  filterColumnMap: {
    'household.identity.household_name': 'household_name',
    'household.identity.household_number': 'household_number',
    'household.identity.status': 'status',
    'household.identity.children_count': 'student_counter',
    'household.address.city': 'city',
    'household.address.country': 'country',
    'household.address.postal_code': 'postal_code',
    'household.audit.created_at': 'created_at',
    'household.audit.updated_at': 'updated_at',
  },
  selectFragment: {
    id: true,
    household_name: true,
    household_number: true,
    status: true,
    student_counter: true,
    city: true,
    country: true,
    postal_code: true,
    address_line_1: true,
    created_at: true,
    updated_at: true,
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.household as unknown as PrismaDelegate,
  resolvers: {
    household_name: (r) => r.household_name,
    household_number: (r) => r.household_number,
    status: (r) => r.status,
    student_counter: (r) => r.student_counter,
    city: (r) => r.city,
    country: (r) => r.country,
    postal_code: (r) => r.postal_code,
    address_line_1: (r) => r.address_line_1,
    created_at: (r) => r.created_at,
    updated_at: (r) => r.updated_at,
  },
});
