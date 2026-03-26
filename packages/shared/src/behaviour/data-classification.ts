export enum DataClassification {
  PUBLIC = 'PUBLIC',
  PARENT = 'PARENT',
  STAFF = 'STAFF',
  SENSITIVE = 'SENSITIVE',
  SAFEGUARDING = 'SAFEGUARDING',
}

const CLASSIFICATION_ORDER = [
  DataClassification.PUBLIC,
  DataClassification.PARENT,
  DataClassification.STAFF,
  DataClassification.SENSITIVE,
  DataClassification.SAFEGUARDING,
];

export const INCIDENT_FIELD_CLASSIFICATION: Record<string, DataClassification> = {
  id: DataClassification.PUBLIC,
  incident_number: DataClassification.STAFF,
  category_id: DataClassification.PARENT,
  polarity: DataClassification.PARENT,
  severity: DataClassification.STAFF,
  description: DataClassification.STAFF,
  parent_description: DataClassification.PARENT,
  parent_description_ar: DataClassification.PARENT,
  parent_description_locked: DataClassification.STAFF,
  context_notes: DataClassification.SENSITIVE,
  location: DataClassification.STAFF,
  context_type: DataClassification.STAFF,
  occurred_at: DataClassification.PARENT,
  logged_at: DataClassification.STAFF,
  status: DataClassification.STAFF,
  follow_up_required: DataClassification.STAFF,
  context_snapshot: DataClassification.STAFF,
  created_at: DataClassification.STAFF,
  updated_at: DataClassification.STAFF,
};

export function stripFieldsByClassification<T extends Record<string, unknown>>(
  data: T,
  fieldMap: Record<string, DataClassification>,
  userMaxClass: DataClassification,
): Partial<T> {
  const userLevel = CLASSIFICATION_ORDER.indexOf(userMaxClass);

  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(data)) {
    const fieldClass = fieldMap[key];
    if (!fieldClass || CLASSIFICATION_ORDER.indexOf(fieldClass) <= userLevel) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export function getUserDataClassification(permissions: string[]): DataClassification {
  if (permissions.includes('safeguarding.view') || permissions.includes('safeguarding.manage')) {
    return DataClassification.SAFEGUARDING;
  }
  if (permissions.includes('behaviour.view_sensitive')) {
    return DataClassification.SENSITIVE;
  }
  if (permissions.includes('behaviour.view') || permissions.includes('behaviour.manage')) {
    return DataClassification.STAFF;
  }
  if (permissions.includes('behaviour.appeal')) {
    return DataClassification.PARENT;
  }
  return DataClassification.PUBLIC;
}
