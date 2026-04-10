// ─── Canonical system form field definitions ─────────────────────────────────
//
// The single source of truth for the fields collected by the admission form.
// Used by both the walk-in RegistrationWizard (future: when it becomes
// tenant-configurable) and the public online application form. Keeping this
// list in @school/shared lets the API service and the frontend preview page
// import it without crossing module boundaries.
//
// Field order drives display order on the public form.
// `options_json` for the two dynamic selects (target academic year / year
// group) is resolved at request time by AdmissionFormsService.getPublishedForm.

export type SystemFormFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'single_select'
  | 'multi_select'
  | 'phone'
  | 'email'
  | 'country'
  | 'yes_no';

export interface SystemFormFieldOption {
  value: string;
  label: string;
}

export interface SystemFormFieldDefinition {
  field_key: string;
  label: string;
  help_text?: string;
  field_type: SystemFormFieldType;
  required: boolean;
  searchable?: boolean;
  reportable?: boolean;
  options_json?: SystemFormFieldOption[];
}

// Build the canonical list with implicit ordering (index = display_order).
const FIELDS: SystemFormFieldDefinition[] = [
  // ── Parent/Guardian 1 ──
  {
    field_key: 'parent1_first_name',
    label: 'Parent/Guardian First Name',
    field_type: 'short_text',
    required: true,
    searchable: true,
  },
  {
    field_key: 'parent1_last_name',
    label: 'Parent/Guardian Last Name',
    field_type: 'short_text',
    required: true,
    searchable: true,
  },
  {
    field_key: 'parent1_email',
    label: 'Parent/Guardian Email',
    field_type: 'email',
    required: true,
    searchable: true,
    help_text: 'Required for online applications',
  },
  {
    field_key: 'parent1_phone',
    label: 'Parent/Guardian Phone',
    field_type: 'phone',
    required: true,
  },
  {
    field_key: 'parent1_relationship',
    label: 'Relationship to Student',
    field_type: 'single_select',
    required: true,
    options_json: [
      { value: 'father', label: 'Father' },
      { value: 'mother', label: 'Mother' },
      { value: 'guardian', label: 'Guardian' },
      { value: 'other', label: 'Other' },
    ],
  },

  // ── Parent/Guardian 2 (optional) ──
  {
    field_key: 'parent2_first_name',
    label: 'Second Parent First Name',
    field_type: 'short_text',
    required: false,
  },
  {
    field_key: 'parent2_last_name',
    label: 'Second Parent Last Name',
    field_type: 'short_text',
    required: false,
  },
  {
    field_key: 'parent2_email',
    label: 'Second Parent Email',
    field_type: 'email',
    required: false,
  },
  {
    field_key: 'parent2_phone',
    label: 'Second Parent Phone',
    field_type: 'phone',
    required: false,
  },
  {
    field_key: 'parent2_relationship',
    label: 'Second Parent Relationship',
    field_type: 'single_select',
    required: false,
    options_json: [
      { value: 'father', label: 'Father' },
      { value: 'mother', label: 'Mother' },
      { value: 'guardian', label: 'Guardian' },
      { value: 'other', label: 'Other' },
    ],
  },

  // ── Household / Address ──
  {
    field_key: 'address_line_1',
    label: 'Address Line 1',
    field_type: 'short_text',
    required: true,
  },
  {
    field_key: 'address_line_2',
    label: 'Address Line 2',
    field_type: 'short_text',
    required: false,
  },
  {
    field_key: 'city',
    label: 'City',
    field_type: 'short_text',
    required: true,
  },
  {
    field_key: 'country',
    label: 'Country',
    field_type: 'country',
    required: true,
  },
  {
    field_key: 'postal_code',
    label: 'Postal Code',
    field_type: 'short_text',
    required: false,
  },

  // ── Emergency Contact ──
  {
    field_key: 'emergency_name',
    label: 'Emergency Contact Name',
    field_type: 'short_text',
    required: false,
  },
  {
    field_key: 'emergency_phone',
    label: 'Emergency Contact Phone',
    field_type: 'phone',
    required: false,
  },
  {
    field_key: 'emergency_relationship',
    label: 'Emergency Contact Relationship',
    field_type: 'short_text',
    required: false,
  },

  // ── Target academic year / year group (new in this rebuild) ──
  // Options resolved server-side at form fetch time.
  {
    field_key: 'target_academic_year_id',
    label: 'Target Academic Year',
    field_type: 'single_select',
    required: true,
  },
  {
    field_key: 'target_year_group_id',
    label: 'Target Year Group',
    field_type: 'single_select',
    required: true,
  },

  // ── Student ──
  {
    field_key: 'student_first_name',
    label: 'Student First Name',
    field_type: 'short_text',
    required: true,
    searchable: true,
  },
  {
    field_key: 'student_middle_name',
    label: 'Student Middle Name',
    field_type: 'short_text',
    required: false,
  },
  {
    field_key: 'student_last_name',
    label: 'Student Last Name',
    field_type: 'short_text',
    required: true,
    searchable: true,
  },
  {
    field_key: 'student_dob',
    label: 'Date of Birth',
    field_type: 'date',
    required: true,
  },
  {
    field_key: 'student_gender',
    label: 'Gender',
    field_type: 'single_select',
    required: true,
    reportable: true,
    options_json: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  {
    field_key: 'student_national_id',
    label: 'National ID',
    field_type: 'short_text',
    required: true,
  },
  {
    field_key: 'student_medical_notes',
    label: 'Medical Notes',
    field_type: 'long_text',
    required: false,
  },
  {
    field_key: 'student_allergies',
    label: 'Has Allergies',
    field_type: 'yes_no',
    required: false,
  },
];

export const SYSTEM_FORM_FIELDS: ReadonlyArray<
  SystemFormFieldDefinition & { display_order: number }
> = FIELDS.map((field, index) => ({ ...field, display_order: index }));

export const SYSTEM_FORM_NAME = 'System Application Form';

// Field keys whose options_json is resolved dynamically at form fetch time
// (by AdmissionFormsService.getPublishedForm) rather than baked into the
// database row.
export const DYNAMIC_OPTION_FIELD_KEYS = new Set<string>([
  'target_academic_year_id',
  'target_year_group_id',
]);
