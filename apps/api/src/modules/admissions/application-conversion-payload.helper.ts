import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { ConsentCaptureDto } from '@school/shared/gdpr';

// Keys derived from SYSTEM_FORM_FIELDS. If any are missing we raise
// PAYLOAD_MALFORMED rather than letting Prisma explode mid-write.
const REQUIRED_PAYLOAD_KEYS = [
  'parent1_first_name',
  'parent1_last_name',
  'address_line_1',
  'city',
  'country',
] as const;

type RequiredPayloadKey = (typeof REQUIRED_PAYLOAD_KEYS)[number];

export interface ConversionPayload {
  parent1_first_name: string;
  parent1_last_name: string;
  parent1_email: string | null;
  parent1_phone: string | null;
  parent1_relationship: string | null;
  parent2_first_name: string | null;
  parent2_last_name: string | null;
  parent2_email: string | null;
  parent2_phone: string | null;
  parent2_relationship: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  country: string;
  postal_code: string | null;
  student_first_name: string;
  student_middle_name: string | null;
  student_last_name: string;
  student_dob: string | null;
  student_gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  student_national_id: string | null;
  student_medical_notes: string | null;
  student_allergies: boolean | null;
  consents: ConsentCaptureDto | null;
}

/**
 * Parse the application payload JSON into a typed structure.
 *
 * @param raw - The raw payload_json from the application row.
 * @param options.existingHousehold - When true, parent/address fields are
 *   optional because the household already exists (existing-family path).
 */
export function parseConversionPayload(
  raw: Prisma.JsonValue,
  options?: { existingHousehold?: boolean },
): ConversionPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException({
      error: { code: 'PAYLOAD_MALFORMED', message: 'Application payload missing or not an object' },
    });
  }
  const obj = raw as Record<string, unknown>;

  // Existing-household applications skip household/parent validation —
  // the payload only contains student fields.
  if (!options?.existingHousehold) {
    const missing: RequiredPayloadKey[] = [];
    for (const key of REQUIRED_PAYLOAD_KEYS) {
      const v = obj[key];
      if (v === undefined || v === null || v === '') missing.push(key);
    }
    if (missing.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'PAYLOAD_MALFORMED',
          message: `Application payload is missing required fields: ${missing.join(', ')}`,
          details: { missing },
        },
      });
    }
  }

  const asString = (k: string): string | null => {
    const v = obj[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  const asGender = (k: string): ConversionPayload['student_gender'] => {
    const v = obj[k];
    return v === 'male' || v === 'female' || v === 'other' || v === 'prefer_not_to_say' ? v : null;
  };
  const asBool = (k: string): boolean | null => {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 'yes') return true;
    if (v === 'false' || v === 'no') return false;
    return null;
  };

  const consentsRaw = obj.__consents;
  const consents =
    consentsRaw && typeof consentsRaw === 'object' && !Array.isArray(consentsRaw)
      ? (consentsRaw as ConsentCaptureDto)
      : null;

  return {
    parent1_first_name: asString('parent1_first_name') ?? '',
    parent1_last_name: asString('parent1_last_name') ?? '',
    parent1_email: asString('parent1_email'),
    parent1_phone: asString('parent1_phone'),
    parent1_relationship: asString('parent1_relationship'),
    parent2_first_name: asString('parent2_first_name'),
    parent2_last_name: asString('parent2_last_name'),
    parent2_email: asString('parent2_email'),
    parent2_phone: asString('parent2_phone'),
    parent2_relationship: asString('parent2_relationship'),
    address_line_1: asString('address_line_1') ?? '',
    address_line_2: asString('address_line_2'),
    city: asString('city') ?? '',
    country: asString('country') ?? '',
    postal_code: asString('postal_code'),
    student_first_name: asString('student_first_name') ?? '',
    student_middle_name: asString('student_middle_name'),
    student_last_name: asString('student_last_name') ?? '',
    student_dob: asString('student_dob'),
    student_gender: asGender('student_gender'),
    student_national_id: asString('student_national_id'),
    student_medical_notes: asString('student_medical_notes'),
    student_allergies: asBool('student_allergies'),
    consents,
  };
}
