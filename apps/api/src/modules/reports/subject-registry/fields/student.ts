import { buildAdapter, type PrismaDelegate } from '../build-adapter';
import type { SubjectAdapter } from '../subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from '../types';

// ─── Field catalogue ─────────────────────────────────────────────────────────

const fields: readonly FieldDescriptor[] = [
  // Identity
  {
    id: 'student.identity.student_number',
    label_key: 'reports.fields.student.identity.student_number',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'student_number',
  },
  {
    id: 'student.identity.first_name',
    label_key: 'reports.fields.student.identity.first_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'first_name',
  },
  {
    id: 'student.identity.last_name',
    label_key: 'reports.fields.student.identity.last_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'last_name',
  },
  {
    id: 'student.identity.middle_name',
    label_key: 'reports.fields.student.identity.middle_name',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'middle_name',
  },
  {
    id: 'student.identity.date_of_birth',
    label_key: 'reports.fields.student.identity.date_of_birth',
    domain: 'identity',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'date_of_birth',
  },
  {
    id: 'student.identity.age',
    label_key: 'reports.fields.student.identity.age',
    domain: 'identity',
    type: 'number',
    filterable: false,
    groupable: true,
    aggregations: ['count', 'avg', 'min', 'max'],
    resolver: 'computed_age',
  },
  {
    id: 'student.identity.gender',
    label_key: 'reports.fields.student.identity.gender',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['male', 'female', 'other', 'prefer_not_to_say'],
    resolver: 'gender',
  },
  {
    id: 'student.identity.nationality',
    label_key: 'reports.fields.student.identity.nationality',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'nationality',
  },
  {
    id: 'student.identity.status',
    label_key: 'reports.fields.student.identity.status',
    domain: 'identity',
    type: 'enum',
    filterable: true,
    groupable: true,
    enum_values: ['applicant', 'active', 'withdrawn', 'graduated', 'archived'],
    resolver: 'status',
  },
  {
    id: 'student.identity.national_id',
    label_key: 'reports.fields.student.identity.national_id',
    domain: 'identity',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'national_id',
    permission: 'students.view_sensitive',
  },

  // Enrolment
  {
    id: 'student.enrolment.year_group_name',
    label_key: 'reports.fields.student.enrolment.year_group_name',
    domain: 'enrolment',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'year_group_name',
  },
  {
    id: 'student.enrolment.homeroom_class_name',
    label_key: 'reports.fields.student.enrolment.homeroom_class_name',
    domain: 'enrolment',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'homeroom_class_name',
  },
  {
    id: 'student.enrolment.entry_date',
    label_key: 'reports.fields.student.enrolment.entry_date',
    domain: 'enrolment',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'entry_date',
  },
  {
    id: 'student.enrolment.exit_date',
    label_key: 'reports.fields.student.enrolment.exit_date',
    domain: 'enrolment',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'exit_date',
  },

  // Household
  {
    id: 'student.household.household_name',
    label_key: 'reports.fields.student.household.household_name',
    domain: 'household',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'household_name',
  },
  {
    id: 'student.household.household_number',
    label_key: 'reports.fields.student.household.household_number',
    domain: 'household',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'household_number',
  },
  {
    id: 'student.household.city',
    label_key: 'reports.fields.student.household.city',
    domain: 'household',
    type: 'string',
    filterable: true,
    groupable: true,
    resolver: 'household_city',
  },
  {
    id: 'student.household.postal_code',
    label_key: 'reports.fields.student.household.postal_code',
    domain: 'household',
    type: 'string',
    filterable: true,
    groupable: false,
    resolver: 'household_postal_code',
  },
  {
    id: 'student.household.size',
    label_key: 'reports.fields.student.household.size',
    domain: 'household',
    type: 'number',
    filterable: false,
    groupable: true,
    aggregations: ['count', 'avg', 'min', 'max'],
    resolver: 'computed_household_size',
  },

  // Medical
  {
    id: 'student.medical.has_allergy',
    label_key: 'reports.fields.student.medical.has_allergy',
    domain: 'medical',
    type: 'boolean',
    filterable: true,
    groupable: true,
    resolver: 'has_allergy',
    permission: 'students.view_medical',
  },
  {
    id: 'student.medical.allergy_details',
    label_key: 'reports.fields.student.medical.allergy_details',
    domain: 'medical',
    type: 'string',
    filterable: false,
    groupable: false,
    resolver: 'allergy_details',
    permission: 'students.view_medical',
  },

  // Audit
  {
    id: 'student.audit.created_at',
    label_key: 'reports.fields.student.audit.created_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'created_at',
  },
  {
    id: 'student.audit.updated_at',
    label_key: 'reports.fields.student.audit.updated_at',
    domain: 'audit',
    type: 'date',
    filterable: true,
    groupable: false,
    resolver: 'updated_at',
  },
];

const STUDENT_SUBJECT: SubjectDescriptor = {
  key: 'student',
  label_key: 'reports.subjects.student.label',
  icon_name: 'GraduationCap',
  primary_model: 'Student',
  fields,
};

type StudentRow = {
  id: string;
  student_number: string | null;
  national_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: Date;
  gender: string | null;
  nationality: string | null;
  status: string;
  entry_date: Date | null;
  exit_date: Date | null;
  has_allergy: boolean;
  allergy_details: string | null;
  created_at: Date;
  updated_at: Date;
  year_group: { id: string; name: string } | null;
  homeroom_class: { id: string; name: string } | null;
  household: {
    id: string;
    household_name: string;
    household_number: string | null;
    city: string | null;
    postal_code: string | null;
    student_counter: number;
  } | null;
};

export const STUDENT_ADAPTER: SubjectAdapter = buildAdapter<StudentRow>({
  descriptor: STUDENT_SUBJECT,
  filterColumnMap: {
    'student.identity.student_number': 'student_number',
    'student.identity.first_name': 'first_name',
    'student.identity.last_name': 'last_name',
    'student.identity.middle_name': 'middle_name',
    'student.identity.date_of_birth': 'date_of_birth',
    'student.identity.gender': 'gender',
    'student.identity.nationality': 'nationality',
    'student.identity.status': 'status',
    'student.identity.national_id': 'national_id',
    'student.enrolment.year_group_name': 'year_group.name',
    'student.enrolment.homeroom_class_name': 'homeroom_class.name',
    'student.enrolment.entry_date': 'entry_date',
    'student.enrolment.exit_date': 'exit_date',
    'student.household.household_name': 'household.household_name',
    'student.household.household_number': 'household.household_number',
    'student.household.city': 'household.city',
    'student.household.postal_code': 'household.postal_code',
    'student.medical.has_allergy': 'has_allergy',
    'student.audit.created_at': 'created_at',
    'student.audit.updated_at': 'updated_at',
  },
  selectFragment: {
    id: true,
    student_number: true,
    national_id: true,
    first_name: true,
    middle_name: true,
    last_name: true,
    date_of_birth: true,
    gender: true,
    nationality: true,
    status: true,
    entry_date: true,
    exit_date: true,
    has_allergy: true,
    allergy_details: true,
    created_at: true,
    updated_at: true,
    year_group: { select: { id: true, name: true } },
    homeroom_class: { select: { id: true, name: true } },
    household: {
      select: {
        id: true,
        household_name: true,
        household_number: true,
        city: true,
        postal_code: true,
        student_counter: true,
      },
    },
  },
  defaultOrderBy: [{ created_at: 'desc' }],
  getDelegate: (tx) => tx.student as unknown as PrismaDelegate,
  resolvers: {
    student_number: (r) => r.student_number,
    national_id: (r) => r.national_id,
    first_name: (r) => r.first_name,
    middle_name: (r) => r.middle_name,
    last_name: (r) => r.last_name,
    date_of_birth: (r) => r.date_of_birth,
    gender: (r) => r.gender,
    nationality: (r) => r.nationality,
    status: (r) => r.status,
    entry_date: (r) => r.entry_date,
    exit_date: (r) => r.exit_date,
    has_allergy: (r) => r.has_allergy,
    allergy_details: (r) => r.allergy_details,
    created_at: (r) => r.created_at,
    updated_at: (r) => r.updated_at,
    year_group_name: (r) => r.year_group?.name ?? null,
    homeroom_class_name: (r) => r.homeroom_class?.name ?? null,
    household_name: (r) => r.household?.household_name ?? null,
    household_number: (r) => r.household?.household_number ?? null,
    household_city: (r) => r.household?.city ?? null,
    household_postal_code: (r) => r.household?.postal_code ?? null,
    computed_household_size: (r) => r.household?.student_counter ?? null,
    computed_age: (r) => {
      const dob = r.date_of_birth;
      if (!dob) return null;
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
        age -= 1;
      }
      return age;
    },
  },
});
