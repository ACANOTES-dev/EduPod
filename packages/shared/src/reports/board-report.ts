import { z } from 'zod';

/**
 * Shared Zod schemas + inferred types for the Board Report rebuild (impl 06).
 *
 * The Board Report is a fixed-shape termly packet the school's leadership
 * team presents to its board of governors. It aggregates eight sections
 * (executive / enrolment / attendance / academic / behaviour / safeguarding
 * / finance / staffing) from existing domain data; the author picks which
 * sections to include at generation time.
 *
 * The schemas below are the API contract between:
 *   - `BoardReportService.generate()` on the API (returns `BoardReport`)
 *   - `POST /v1/reports/board` / `GET /v1/reports/board/history` routes
 *   - the Wave 4 UI (impl 20) which renders each section
 *   - the export pipeline (impl 04) which serialises the packet to
 *     PDF / Excel / Word.
 *
 * Every per-section schema carries a literal `type` discriminator so the
 * UI (and exporters) can render each section without a separate type-guard.
 */

// ─── Section keys ──────────────────────────────────────────────────────────

/**
 * The eight section keys a generated Board Report may contain. The author
 * picks which ones to include at generation time; the default is all eight.
 */
export const BOARD_REPORT_SECTION_KEYS = [
  'executive',
  'enrolment',
  'attendance',
  'academic',
  'behaviour',
  'safeguarding',
  'finance',
  'staffing',
] as const;

export type BoardReportSectionKey = (typeof BOARD_REPORT_SECTION_KEYS)[number];

export const boardReportSectionKeySchema = z.enum(BOARD_REPORT_SECTION_KEYS);

// ─── Executive Summary ─────────────────────────────────────────────────────

export const executiveSummarySectionSchema = z.object({
  type: z.literal('executive'),
  headline_metrics: z.object({
    student_headcount: z.number().int().nonnegative(),
    attendance_rate_pct: z.number(),
    collection_rate_pct: z.number(),
    at_risk_student_count: z.number().int().nonnegative(),
    open_safeguarding_concerns: z.number().int().nonnegative(),
  }),
  /**
   * AI-narration placeholder: populated by the ai_narration service when
   * enabled; otherwise an empty string. The board-report path does not
   * itself call the AI — impl 10 hooks in later.
   */
  narrative: z.string(),
});
export type ExecutiveSummarySection = z.infer<typeof executiveSummarySectionSchema>;

// ─── Enrolment & Demographics ──────────────────────────────────────────────

export const enrolmentSectionSchema = z.object({
  type: z.literal('enrolment'),
  total_headcount: z.number().int().nonnegative(),
  headcount_by_year_group: z.array(
    z.object({
      year_group_id: z.string().uuid().nullable(),
      year_group_name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  gender_split: z.array(
    z.object({
      gender: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  nationality_split: z.array(
    z.object({
      nationality: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  enrolment_change_vs_prior_term: z.object({
    current: z.number().int().nonnegative(),
    prior: z.number().int().nonnegative(),
    delta: z.number().int(),
  }),
});
export type EnrolmentSection = z.infer<typeof enrolmentSectionSchema>;

// ─── Attendance ────────────────────────────────────────────────────────────

export const attendanceSectionSchema = z.object({
  type: z.literal('attendance'),
  average_rate_pct: z.number(),
  rate_by_year_group: z.array(
    z.object({
      year_group_id: z.string().uuid().nullable(),
      year_group_name: z.string(),
      rate_pct: z.number(),
    }),
  ),
  chronic_absenteeism_count: z.number().int().nonnegative(),
  chronic_absenteeism_threshold_pct: z.number(),
  day_of_week_pattern: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      weekday_label: z.string(),
      rate_pct: z.number(),
    }),
  ),
});
export type AttendanceSection = z.infer<typeof attendanceSectionSchema>;

// ─── Academic Performance ──────────────────────────────────────────────────

export const academicSectionSchema = z.object({
  type: z.literal('academic'),
  pass_fail_by_year_group: z.array(
    z.object({
      year_group_id: z.string().uuid().nullable(),
      year_group_name: z.string(),
      pass_rate_pct: z.number(),
      fail_rate_pct: z.number(),
      graded_count: z.number().int().nonnegative(),
    }),
  ),
  subject_averages: z.array(
    z.object({
      subject_id: z.string().uuid().nullable(),
      subject_name: z.string(),
      average_score_pct: z.number(),
      graded_count: z.number().int().nonnegative(),
    }),
  ),
  top_performers: z.array(
    z.object({
      display_label: z.string().describe('Initials-only when anonymised, full name otherwise'),
      year_group_name: z.string(),
      average_score_pct: z.number(),
    }),
  ),
  bottom_performers: z.array(
    z.object({
      display_label: z.string(),
      year_group_name: z.string(),
      average_score_pct: z.number(),
    }),
  ),
});
export type AcademicSection = z.infer<typeof academicSectionSchema>;

// ─── Behaviour ─────────────────────────────────────────────────────────────

export const behaviourSectionSchema = z.object({
  type: z.literal('behaviour'),
  incident_count_total: z.number().int().nonnegative(),
  incident_count_by_category: z.array(
    z.object({
      category_id: z.string().uuid().nullable(),
      category_name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  incident_count_by_year_group: z.array(
    z.object({
      year_group_id: z.string().uuid().nullable(),
      year_group_name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  sanction_outcomes: z.array(
    z.object({
      sanction_type: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  appeals_outcomes: z.array(
    z.object({
      outcome: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  trend_vs_prior_term: z.object({
    current: z.number().int().nonnegative(),
    prior: z.number().int().nonnegative(),
    delta: z.number().int(),
  }),
});
export type BehaviourSection = z.infer<typeof behaviourSectionSchema>;

// ─── Safeguarding ──────────────────────────────────────────────────────────

export const safeguardingSectionSchema = z.object({
  type: z.literal('safeguarding'),
  open_concerns_count: z.number().int().nonnegative(),
  oldest_open_concern_age_days: z.number().int().nonnegative().nullable(),
  age_histogram: z.array(
    z.object({
      bucket_label: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  actions_taken_count: z.number().int().nonnegative(),
  critical_incidents_count: z.number().int().nonnegative(),
  /**
   * DLP-only textual summary. When `anonymise=true` (the default), this
   * stays as a short generic string; when the generator has the
   * `safeguarding.view_detail` permission AND `anonymise=false` it MAY
   * hold a paragraph that names severe concerns.
   */
  detail_summary: z.string(),
});
export type SafeguardingSection = z.infer<typeof safeguardingSectionSchema>;

// ─── Finance ───────────────────────────────────────────────────────────────

export const financeSectionSchema = z.object({
  type: z.literal('finance'),
  invoices_issued_count: z.number().int().nonnegative(),
  total_invoiced_amount: z.number(),
  total_collected_amount: z.number(),
  collection_rate_pct: z.number(),
  overdue_count: z.number().int().nonnegative(),
  overdue_amount: z.number(),
  write_off_count: z.number().int().nonnegative(),
  write_off_amount: z.number(),
  currency_code: z.string(),
});
export type FinanceSection = z.infer<typeof financeSectionSchema>;

// ─── Staffing ──────────────────────────────────────────────────────────────

export const staffingSectionSchema = z.object({
  type: z.literal('staffing'),
  headcount_active: z.number().int().nonnegative(),
  headcount_inactive: z.number().int().nonnegative(),
  turnover_this_term: z.object({
    departures: z.number().int().nonnegative(),
    arrivals: z.number().int().nonnegative(),
  }),
  attendance_rate_pct: z.number(),
  pending_leave_requests: z.number().int().nonnegative(),
  absences_this_term: z.number().int().nonnegative(),
  cover_gaps_unfilled: z.number().int().nonnegative(),
});
export type StaffingSection = z.infer<typeof staffingSectionSchema>;

// ─── Composed board report ─────────────────────────────────────────────────

/**
 * Discriminated-union guard — every section carries `type`, so consumers
 * can switch on `section.type` without wrapping a type-guard of their own.
 */
export const boardReportSectionSchema = z.discriminatedUnion('type', [
  executiveSummarySectionSchema,
  enrolmentSectionSchema,
  attendanceSectionSchema,
  academicSectionSchema,
  behaviourSectionSchema,
  safeguardingSectionSchema,
  financeSectionSchema,
  staffingSectionSchema,
]);
export type BoardReportSection = z.infer<typeof boardReportSectionSchema>;

/**
 * Final Board Report envelope returned by `BoardReportService.generate()`.
 * Sections that were not requested simply don't appear in the `sections`
 * map — consumers check for presence.
 */
export const boardReportSchema = z.object({
  tenant: z.object({
    tenant_id: z.string().uuid(),
    name: z.string(),
    academic_year_id: z.string().uuid(),
    academic_year_name: z.string(),
    term_number: z.number().int().min(1).max(4),
    term_label: z.string(),
  }),
  generated_at: z.string().datetime(),
  generated_by_user_id: z.string().uuid(),
  anonymise: z.boolean(),
  sections_included: z.array(boardReportSectionKeySchema),
  sections: z.object({
    executive: executiveSummarySectionSchema.optional(),
    enrolment: enrolmentSectionSchema.optional(),
    attendance: attendanceSectionSchema.optional(),
    academic: academicSectionSchema.optional(),
    behaviour: behaviourSectionSchema.optional(),
    safeguarding: safeguardingSectionSchema.optional(),
    finance: financeSectionSchema.optional(),
    staffing: staffingSectionSchema.optional(),
  }),
});
export type BoardReport = z.infer<typeof boardReportSchema>;

// ─── Request schemas ───────────────────────────────────────────────────────

/**
 * Body schema for `POST /v1/reports/board`. `sections` defaults to all
 * eight; `anonymise` defaults to `true` — the de-identified path is the
 * safe default for board packets.
 */
export const boardReportRequestSchema = z.object({
  term: z.object({
    academic_year_id: z.string().uuid(),
    term_number: z.number().int().min(1).max(4),
  }),
  sections: z.array(boardReportSectionKeySchema).default([...BOARD_REPORT_SECTION_KEYS]),
  anonymise: z.boolean().default(true),
});
export type BoardReportRequest = z.infer<typeof boardReportRequestSchema>;

// ─── History entry ─────────────────────────────────────────────────────────

/**
 * One row of `GET /v1/reports/board/history`. Provides enough for the
 * settings UI to let an admin re-download a prior packet.
 */
export const boardReportHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  academic_year_id: z.string().uuid().nullable(),
  academic_year_name: z.string().nullable(),
  term_label: z.string(),
  sections_included: z.array(boardReportSectionKeySchema),
  anonymise: z.boolean(),
  generated_at: z.string().datetime(),
  generated_by_user_id: z.string().uuid(),
  generated_by_display_name: z.string().nullable(),
});
export type BoardReportHistoryEntry = z.infer<typeof boardReportHistoryEntrySchema>;

/**
 * Paginated wrapper for `GET /v1/reports/board/history`.
 */
export const boardReportHistoryResponseSchema = z.object({
  data: z.array(boardReportHistoryEntrySchema),
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
  }),
});
export type BoardReportHistoryResponse = z.infer<typeof boardReportHistoryResponseSchema>;
