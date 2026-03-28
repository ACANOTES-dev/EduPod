// ─── Special Category Keyword Detection (DPC August 2025 Guidance) ──────────

export const SPECIAL_CATEGORY_KEYWORDS = [
  // Health
  'health', 'medical', 'allergy', 'allergies', 'medication', 'disability',
  'diagnosis', 'condition', 'illness', 'hospital', 'doctor', 'gp',
  'immunisation', 'vaccination', 'special needs', 'sen',
  // Religion
  'religion', 'religious', 'faith', 'church', 'mosque', 'parish',
  'denomination', 'baptism', 'communion',
  // Ethnicity / Race
  'ethnicity', 'ethnic', 'race', 'racial', 'traveller', 'roma',
  // Other Article 9
  'sexual orientation', 'political', 'trade union', 'biometric', 'genetic',
] as const;

export type SpecialCategoryKeyword = typeof SPECIAL_CATEGORY_KEYWORDS[number];

export interface DataMinimisationWarning {
  field_key: string;
  field_label: string;
  matched_keyword: string;
  category: 'health' | 'religion' | 'ethnicity' | 'other_article_9';
}

// ─── Category classification ────────────────────────────────────────────────

function categoriseKeyword(keyword: string): DataMinimisationWarning['category'] {
  const healthKeywords = [
    'health', 'medical', 'allergy', 'allergies', 'medication', 'disability',
    'diagnosis', 'condition', 'illness', 'hospital', 'doctor', 'gp',
    'immunisation', 'vaccination', 'special needs', 'sen',
  ];
  const religionKeywords = [
    'religion', 'religious', 'faith', 'church', 'mosque', 'parish',
    'denomination', 'baptism', 'communion',
  ];
  const ethnicityKeywords = [
    'ethnicity', 'ethnic', 'race', 'racial', 'traveller', 'roma',
  ];

  if (healthKeywords.includes(keyword)) return 'health';
  if (religionKeywords.includes(keyword)) return 'religion';
  if (ethnicityKeywords.includes(keyword)) return 'ethnicity';
  return 'other_article_9';
}

// ─── Detection engine ───────────────────────────────────────────────────────

export function detectSpecialCategoryFields(
  fields: Array<{ field_key: string; label: string }>,
): DataMinimisationWarning[] {
  const warnings: DataMinimisationWarning[] = [];

  for (const field of fields) {
    const labelLower = field.label.toLowerCase();
    const keyLower = field.field_key.toLowerCase();

    for (const keyword of SPECIAL_CATEGORY_KEYWORDS) {
      if (labelLower.includes(keyword) || keyLower.includes(keyword)) {
        warnings.push({
          field_key: field.field_key,
          field_label: field.label,
          matched_keyword: keyword,
          category: categoriseKeyword(keyword),
        });
        break; // One warning per field
      }
    }
  }

  return warnings;
}
