// ─── Wizard shared types ─────────────────────────────────────────────────────
// Local types for the 6-step generation wizard. Kept in one file so every
// step component can import from a single module.

import type {
  CommentGateDryRunResult,
  GenerationScopeMode,
  PersonalInfoField,
} from '@school/shared';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export const WIZARD_STEPS: WizardStep[] = [1, 2, 3, 4, 5, 6];

export type RunStatus = 'queued' | 'running' | 'completed' | 'partial_success' | 'failed' | null;

export interface WizardState {
  step: WizardStep;
  scope: {
    mode: GenerationScopeMode | null;
    ids: string[];
  };
  /**
   * Phase 1b — Option B: the wizard now distinguishes three states:
   *  - `null` and `academicYearId === null` → nothing selected yet
   *  - `string` (UUID) → per-period scope; the year is derived server-side
   *  - `null` and `academicYearId !== null` → full-year scope
   *
   * Step 2 sets one of `academicPeriodId` or `academicYearId` and clears the
   * other via `SET_PERIOD_OR_YEAR`. Step 5 dry-run + Step 6 submit pass both
   * fields through; the API enforces exactly-one-of.
   */
  academicPeriodId: string | null;
  academicYearId: string | null;
  contentScope: 'grades_only' | null;
  templateLocales: string[];
  personalInfoFields: PersonalInfoField[];
  dryRun: {
    loading: boolean;
    result: CommentGateDryRunResult | null;
    error: string | null;
  };
  overrideCommentGate: boolean;
  submit: {
    submitting: boolean;
    runId: string | null;
    runStatus: RunStatus;
    lastError: string | null;
    runSnapshot: GenerationRunSnapshot | null;
  };
}

export interface GenerationRunSnapshot {
  id: string;
  status: RunStatus;
  students_generated_count: number;
  students_blocked_count: number;
  total_count: number;
  errors: Array<{ student_id: string; message: string }>;
}

export type WizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SET_SCOPE_MODE'; mode: GenerationScopeMode | null }
  | { type: 'SET_SCOPE_IDS'; ids: string[] }
  | { type: 'SET_PERIOD'; id: string | null }
  | { type: 'SET_FULL_YEAR'; academicYearId: string }
  | { type: 'SET_CONTENT_SCOPE'; contentScope: 'grades_only' | null; locales: string[] }
  | { type: 'TOGGLE_FIELD'; field: PersonalInfoField }
  | { type: 'SET_FIELDS'; fields: PersonalInfoField[] }
  | { type: 'DRY_RUN_START' }
  | { type: 'DRY_RUN_SUCCESS'; result: CommentGateDryRunResult }
  | { type: 'DRY_RUN_FAILURE'; error: string }
  | { type: 'SET_OVERRIDE'; value: boolean }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; runId: string }
  | { type: 'SUBMIT_FAILURE'; error: string }
  | { type: 'POLL_UPDATE'; snapshot: GenerationRunSnapshot }
  | { type: 'RESET' };

export const initialWizardState: WizardState = {
  step: 1,
  scope: { mode: null, ids: [] },
  academicPeriodId: null,
  academicYearId: null,
  contentScope: null,
  templateLocales: [],
  personalInfoFields: [],
  dryRun: { loading: false, result: null, error: null },
  overrideCommentGate: false,
  submit: {
    submitting: false,
    runId: null,
    runStatus: null,
    lastError: null,
    runSnapshot: null,
  },
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'NEXT':
      return { ...state, step: Math.min(6, state.step + 1) as WizardStep };
    case 'PREV':
      return { ...state, step: Math.max(1, state.step - 1) as WizardStep };
    case 'SET_SCOPE_MODE':
      // Clear the ID list whenever the mode changes so we never leak IDs
      // from one scope type into another.
      return { ...state, scope: { mode: action.mode, ids: [] } };
    case 'SET_SCOPE_IDS':
      return { ...state, scope: { ...state.scope, ids: action.ids } };
    case 'SET_PERIOD':
      // Selecting a per-period scope clears any pending full-year choice.
      return { ...state, academicPeriodId: action.id, academicYearId: null };
    case 'SET_FULL_YEAR':
      // Selecting a full-year scope clears any pending per-period choice.
      return { ...state, academicPeriodId: null, academicYearId: action.academicYearId };
    case 'SET_CONTENT_SCOPE':
      return {
        ...state,
        contentScope: action.contentScope,
        templateLocales: action.locales,
      };
    case 'TOGGLE_FIELD': {
      const exists = state.personalInfoFields.includes(action.field);
      const next = exists
        ? state.personalInfoFields.filter((f) => f !== action.field)
        : [...state.personalInfoFields, action.field];
      return { ...state, personalInfoFields: next };
    }
    case 'SET_FIELDS':
      return { ...state, personalInfoFields: action.fields };
    case 'DRY_RUN_START':
      return { ...state, dryRun: { loading: true, result: null, error: null } };
    case 'DRY_RUN_SUCCESS':
      return {
        ...state,
        dryRun: { loading: false, result: action.result, error: null },
        // Reset override whenever a fresh dry-run result comes in so the
        // admin re-confirms on each check.
        overrideCommentGate: false,
      };
    case 'DRY_RUN_FAILURE':
      return { ...state, dryRun: { loading: false, result: null, error: action.error } };
    case 'SET_OVERRIDE':
      return { ...state, overrideCommentGate: action.value };
    case 'SUBMIT_START':
      return {
        ...state,
        submit: {
          submitting: true,
          runId: null,
          runStatus: null,
          lastError: null,
          runSnapshot: null,
        },
      };
    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        submit: {
          submitting: false,
          runId: action.runId,
          runStatus: 'queued',
          lastError: null,
          runSnapshot: null,
        },
      };
    case 'SUBMIT_FAILURE':
      return {
        ...state,
        submit: {
          submitting: false,
          runId: null,
          runStatus: null,
          lastError: action.error,
          runSnapshot: null,
        },
      };
    case 'POLL_UPDATE':
      return {
        ...state,
        submit: {
          ...state.submit,
          runStatus: action.snapshot.status,
          runSnapshot: action.snapshot,
        },
      };
    case 'RESET':
      return initialWizardState;
    default:
      return state;
  }
}

// ─── Personal info field sections ────────────────────────────────────────────
// Used by step 4 to group the checkbox list into logical sections.

export const PERSONAL_INFO_FIELD_SECTIONS: Array<{
  key: 'identity' | 'dates' | 'academic' | 'media';
  fields: PersonalInfoField[];
}> = [
  {
    key: 'identity',
    fields: ['full_name', 'student_number', 'sex', 'nationality', 'national_id'],
  },
  { key: 'dates', fields: ['date_of_birth', 'admission_date'] },
  { key: 'academic', fields: ['year_group', 'class_name', 'homeroom_teacher'] },
  { key: 'media', fields: ['photo'] },
];
