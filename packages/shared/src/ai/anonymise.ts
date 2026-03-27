/**
 * AI anonymisation pipeline for behaviour data.
 *
 * Every AI-calling feature MUST use anonymiseForAI before sending data to any
 * LLM provider. The tokenMap is ephemeral — it lives only for the request
 * duration and is never logged, persisted, or returned in API responses.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnonymiseOptions {
  replaceStudentNames: boolean;
  replaceStaffNames: boolean;
  removeUUIDs: boolean;
  removeContextNotes: boolean;
  removeSendDetails: boolean;
  removeSafeguardingFlags: boolean;
}

export interface AnonymisationResult<T> {
  anonymised: T;
  /** In-memory mapping from token to real identity. Never log, never persist. */
  tokenMap: Map<string, string>;
}

/** Default options — all protections enabled. */
export const DEFAULT_ANONYMISE_OPTIONS: AnonymiseOptions = {
  replaceStudentNames: true,
  replaceStaffNames: true,
  removeUUIDs: true,
  removeContextNotes: true,
  removeSendDetails: true,
  removeSafeguardingFlags: true,
};

// ─── Blocked fields ────────────────────────────────────────────────────────

const CONTEXT_NOTE_FIELDS = new Set([
  'context_notes',
  'contextNotes',
  'meeting_notes',
  'meetingNotes',
  'private_notes',
  'privateNotes',
]);

const SEND_FIELDS = new Set([
  'send_aware',
  'sendAware',
  'send_notes',
  'sendNotes',
  'send_status',
  'sendStatus',
  'send_category',
  'sendCategory',
  'has_send',
  'hasSend',
]);

const SAFEGUARDING_FIELDS = new Set([
  'safeguarding_flag',
  'safeguardingFlag',
  'safeguarding_concern',
  'safeguardingConcern',
  'is_safeguarding',
  'isSafeguarding',
  'converted_to_safeguarding',
  'convertedToSafeguarding',
  'child_protection',
  'childProtection',
  'cp_status',
  'cpStatus',
]);

const STUDENT_NAME_FIELDS = new Set([
  'student_name',
  'studentName',
  'first_name',
  'firstName',
  'last_name',
  'lastName',
  'full_name',
  'fullName',
  'name',
  'display_name',
  'displayName',
]);

const STAFF_NAME_FIELDS = new Set([
  'staff_name',
  'staffName',
  'reporter_name',
  'reporterName',
  'teacher_name',
  'teacherName',
  'assigned_to_name',
  'assignedToName',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Core anonymisation ────────────────────────────────────────────────────

/**
 * Anonymise data for AI processing.
 *
 * Returns a deep copy with PII replaced by tokens. The original object is
 * never mutated.
 */
export function anonymiseForAI<T extends object>(
  data: T,
  options: AnonymiseOptions = DEFAULT_ANONYMISE_OPTIONS,
): AnonymisationResult<T> {
  const tokenMap = new Map<string, string>();
  let studentCounter = 0;
  let staffCounter = 0;

  const studentTokens = new Map<string, string>();
  const staffTokens = new Map<string, string>();

  function getStudentToken(realName: string): string {
    const existing = studentTokens.get(realName);
    if (existing) return existing;
    const token = `Student-${String.fromCharCode(65 + studentCounter)}`;
    studentCounter++;
    studentTokens.set(realName, token);
    tokenMap.set(token, realName);
    return token;
  }

  function getStaffToken(realName: string, roleTitle?: string): string {
    if (roleTitle) {
      tokenMap.set(roleTitle, realName);
      return roleTitle;
    }
    const existing = staffTokens.get(realName);
    if (existing) return existing;
    const token = `Staff-${String.fromCharCode(65 + staffCounter)}`;
    staffCounter++;
    staffTokens.set(realName, token);
    tokenMap.set(token, realName);
    return token;
  }

  function processValue(value: unknown, key?: string, parentKey?: string): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      // Remove UUIDs
      if (options.removeUUIDs && UUID_PATTERN.test(value)) {
        return '[REDACTED_ID]';
      }
      // Replace student names
      if (
        options.replaceStudentNames &&
        key &&
        STUDENT_NAME_FIELDS.has(key) &&
        parentKey !== 'staff'
      ) {
        return getStudentToken(value);
      }
      // Replace staff names
      if (options.replaceStaffNames && key && STAFF_NAME_FIELDS.has(key)) {
        return getStaffToken(value);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => processValue(item, key));
    }

    if (typeof value === 'object') {
      return processObject(value as Record<string, unknown>, key);
    }

    return value;
  }

  function processObject(
    obj: Record<string, unknown>,
    parentKey?: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      // Remove context notes
      if (options.removeContextNotes && CONTEXT_NOTE_FIELDS.has(key)) {
        continue;
      }
      // Remove SEND details
      if (options.removeSendDetails && SEND_FIELDS.has(key)) {
        continue;
      }
      // Remove safeguarding flags
      if (options.removeSafeguardingFlags && SAFEGUARDING_FIELDS.has(key)) {
        continue;
      }

      result[key] = processValue(val, key, parentKey);
    }

    return result;
  }

  const anonymised = processObject(data as unknown as Record<string, unknown>) as T;

  return { anonymised, tokenMap };
}

// ─── De-anonymisation ──────────────────────────────────────────────────────

/**
 * Replace tokens in AI response text with real identities.
 *
 * Uses the tokenMap from anonymiseForAI to swap tokens back to display names.
 */
export function deAnonymiseFromAI(
  response: string,
  tokenMap: Map<string, string>,
): string {
  let result = response;
  for (const [token, realName] of tokenMap) {
    result = result.replaceAll(token, realName);
  }
  return result;
}

// ─── System prompt ─────────────────────────────────────────────────────────

export const AI_BEHAVIOUR_SYSTEM_PROMPT = `You are a school behaviour analytics assistant. You must:
- Describe behavioural patterns only. Never diagnose.
- Never infer family circumstances, mental health conditions, or medical diagnoses.
- Never use clinical terminology (e.g. ADHD, autism, anxiety disorder, ODD).
- Do not reference SEND status even if you infer it from patterns.
- Refer to students only by their assigned token (Student-A, etc.).
- Refer to staff only by role title.
- Express uncertainty clearly — do not state patterns as definitive causes.
- All insights are for professional discussion only and must be verified by staff.`;
