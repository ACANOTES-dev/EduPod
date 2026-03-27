import { z } from 'zod';

import {
  actionSourceSchema,
  caseStatusSchema,
  concernSeveritySchema,
  concernSourceSchema,
  dsarDecisionSchema,
  exportPurposeSchema,
  interventionStatusSchema,
  pastoralEntityTypeSchema,
  pastoralTierSchema,
} from '../enums';

// ─── 1. concern_created ────────────────────────────────────────────────────

export const concernCreatedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  student_id: z.string().uuid(),
  category: z.string(),
  severity: concernSeveritySchema,
  tier: pastoralTierSchema,
  narrative_version: z.literal(1),
  narrative_snapshot: z.string(),
  source: concernSourceSchema,
});

export type ConcernCreatedPayload = z.infer<typeof concernCreatedPayloadSchema>;

// ─── 2. concern_tier_escalated ─────────────────────────────────────────────

export const concernTierEscalatedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  old_tier: pastoralTierSchema,
  new_tier: pastoralTierSchema,
  reason: z.string(),
  authorised_by_user_id: z.string().uuid(),
});

export type ConcernTierEscalatedPayload = z.infer<typeof concernTierEscalatedPayloadSchema>;

// ─── 3. concern_narrative_amended ──────────────────────────────────────────

export const concernNarrativeAmendedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  version_number: z.number().int().min(2),
  previous_narrative: z.string(),
  new_narrative: z.string(),
  reason: z.string(),
});

export type ConcernNarrativeAmendedPayload = z.infer<typeof concernNarrativeAmendedPayloadSchema>;

// ─── 4. concern_accessed ───────────────────────────────────────────────────

export const concernAccessedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  tier: pastoralTierSchema,
});

export type ConcernAccessedPayload = z.infer<typeof concernAccessedPayloadSchema>;

// ─── 5. concern_note_added ─────────────────────────────────────────────────

export const concernNoteAddedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  note_text: z.string(),
});

export type ConcernNoteAddedPayload = z.infer<typeof concernNoteAddedPayloadSchema>;

// ─── 6. concern_shared_with_parent ─────────────────────────────────────────

export const concernSharedWithParentPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  share_level: z.string(),
  shared_by_user_id: z.string().uuid(),
});

export type ConcernSharedWithParentPayload = z.infer<typeof concernSharedWithParentPayloadSchema>;

// ─── 7. concern_acknowledged ───────────────────────────────────────────────

export const concernAcknowledgedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  acknowledged_by_user_id: z.string().uuid(),
});

export type ConcernAcknowledgedPayload = z.infer<typeof concernAcknowledgedPayloadSchema>;

// ─── 8. concern_auto_escalated ─────────────────────────────────────────────

export const concernAutoEscalatedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  old_severity: concernSeveritySchema,
  new_severity: concernSeveritySchema,
  reason: z.literal('unacknowledged_timeout'),
  timeout_minutes: z.number(),
});

export type ConcernAutoEscalatedPayload = z.infer<typeof concernAutoEscalatedPayloadSchema>;

// ─── 9. case_created ───────────────────────────────────────────────────────

export const caseCreatedPayloadSchema = z.object({
  case_id: z.string().uuid(),
  student_id: z.string().uuid(),
  case_number: z.string(),
  linked_concern_ids: z.array(z.string().uuid()),
  owner_user_id: z.string().uuid(),
  reason: z.string(),
});

export type CaseCreatedPayload = z.infer<typeof caseCreatedPayloadSchema>;

// ─── 10. case_status_changed ───────────────────────────────────────────────

export const caseStatusChangedPayloadSchema = z.object({
  case_id: z.string().uuid(),
  old_status: caseStatusSchema,
  new_status: caseStatusSchema,
  reason: z.string(),
});

export type CaseStatusChangedPayload = z.infer<typeof caseStatusChangedPayloadSchema>;

// ─── 11. case_ownership_transferred ────────────────────────────────────────

export const caseOwnershipTransferredPayloadSchema = z.object({
  case_id: z.string().uuid(),
  old_owner_user_id: z.string().uuid(),
  new_owner_user_id: z.string().uuid(),
  reason: z.string(),
});

export type CaseOwnershipTransferredPayload = z.infer<typeof caseOwnershipTransferredPayloadSchema>;

// ─── 12. intervention_created ──────────────────────────────────────────────

export const interventionCreatedPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  case_id: z.string().uuid(),
  type: z.string(),
  continuum_level: pastoralTierSchema,
  target_outcomes: z.array(z.object({
    description: z.string(),
    measurable_target: z.string(),
  })),
});

export type InterventionCreatedPayload = z.infer<typeof interventionCreatedPayloadSchema>;

// ─── 13. intervention_status_changed ───────────────────────────────────────

export const interventionStatusChangedPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  old_status: interventionStatusSchema,
  new_status: interventionStatusSchema,
  outcome_notes: z.string().optional(),
});

export type InterventionStatusChangedPayload = z.infer<typeof interventionStatusChangedPayloadSchema>;

// ─── 14. intervention_updated ──────────────────────────────────────────────

export const interventionUpdatedPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  previous_snapshot: z.record(z.string(), z.unknown()),
  changed_fields: z.array(z.string()),
});

export type InterventionUpdatedPayload = z.infer<typeof interventionUpdatedPayloadSchema>;

// ─── 15. action_assigned ───────────────────────────────────────────────────

export const actionAssignedPayloadSchema = z.object({
  action_id: z.string().uuid(),
  source: actionSourceSchema,
  assigned_to_user_id: z.string().uuid(),
  description: z.string(),
  due_date: z.string(),
});

export type ActionAssignedPayload = z.infer<typeof actionAssignedPayloadSchema>;

// ─── 16. action_completed ──────────────────────────────────────────────────

export const actionCompletedPayloadSchema = z.object({
  action_id: z.string().uuid(),
  completed_by_user_id: z.string().uuid(),
});

export type ActionCompletedPayload = z.infer<typeof actionCompletedPayloadSchema>;

// ─── 17. action_overdue ────────────────────────────────────────────────────

export const actionOverduePayloadSchema = z.object({
  action_id: z.string().uuid(),
  assigned_to_user_id: z.string().uuid(),
  due_date: z.string(),
  days_overdue: z.number().int().min(1),
});

export type ActionOverduePayload = z.infer<typeof actionOverduePayloadSchema>;

// ─── 18. parent_contacted ──────────────────────────────────────────────────

export const parentContactedPayloadSchema = z.object({
  parent_contact_id: z.string().uuid(),
  student_id: z.string().uuid(),
  parent_id: z.string().uuid(),
  method: z.string(),
  outcome_summary: z.string(),
});

export type ParentContactedPayload = z.infer<typeof parentContactedPayloadSchema>;

// ─── 19. record_exported ───────────────────────────────────────────────────

export const recordExportedPayloadSchema = z.object({
  export_tier: pastoralTierSchema,
  entity_type: pastoralEntityTypeSchema,
  entity_ids: z.array(z.string().uuid()),
  purpose: exportPurposeSchema.optional(),
  export_ref_id: z.string().uuid(),
  watermarked: z.boolean(),
});

export type RecordExportedPayload = z.infer<typeof recordExportedPayloadSchema>;

// ─── 20. cp_access_granted ─────────────────────────────────────────────────

export const cpAccessGrantedPayloadSchema = z.object({
  grant_id: z.string().uuid(),
  granted_to_user_id: z.string().uuid(),
  granted_by_user_id: z.string().uuid(),
});

export type CpAccessGrantedPayload = z.infer<typeof cpAccessGrantedPayloadSchema>;

// ─── 21. cp_access_revoked ─────────────────────────────────────────────────

export const cpAccessRevokedPayloadSchema = z.object({
  grant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  revoked_by_user_id: z.string().uuid(),
  reason: z.string(),
});

export type CpAccessRevokedPayload = z.infer<typeof cpAccessRevokedPayloadSchema>;

// ─── 22. cp_record_accessed ────────────────────────────────────────────────

export const cpRecordAccessedPayloadSchema = z.object({
  cp_record_id: z.string().uuid(),
  student_id: z.string().uuid(),
});

export type CpRecordAccessedPayload = z.infer<typeof cpRecordAccessedPayloadSchema>;

// ─── 23. mandated_report_generated ─────────────────────────────────────────

export const mandatedReportGeneratedPayloadSchema = z.object({
  cp_record_id: z.string().uuid(),
  student_id: z.string().uuid(),
});

export type MandatedReportGeneratedPayload = z.infer<typeof mandatedReportGeneratedPayloadSchema>;

// ─── 24. mandated_report_submitted ─────────────────────────────────────────

export const mandatedReportSubmittedPayloadSchema = z.object({
  cp_record_id: z.string().uuid(),
  student_id: z.string().uuid(),
  tusla_ref: z.string(),
});

export type MandatedReportSubmittedPayload = z.infer<typeof mandatedReportSubmittedPayloadSchema>;

// ─── 25. dsar_review_routed ────────────────────────────────────────────────

export const dsarReviewRoutedPayloadSchema = z.object({
  dsar_review_id: z.string().uuid(),
  compliance_request_id: z.string().uuid(),
  entity_type: pastoralEntityTypeSchema,
  entity_id: z.string().uuid(),
  tier: pastoralTierSchema,
});

export type DsarReviewRoutedPayload = z.infer<typeof dsarReviewRoutedPayloadSchema>;

// ─── 26. dsar_review_completed ─────────────────────────────────────────────

export const dsarReviewCompletedPayloadSchema = z.object({
  dsar_review_id: z.string().uuid(),
  decision: dsarDecisionSchema,
  legal_basis: z.string().optional(),
});

export type DsarReviewCompletedPayload = z.infer<typeof dsarReviewCompletedPayloadSchema>;

// ─── 26b. dsar_review_decided ─────────────────────────────────────────────

export const dsarReviewDecidedPayloadSchema = z.object({
  review_id: z.string().uuid(),
  compliance_request_id: z.string().uuid(),
  entity_type: pastoralEntityTypeSchema,
  entity_id: z.string().uuid(),
  decision: dsarDecisionSchema,
  legal_basis: z.string().optional(),
});

export type DsarReviewDecidedPayload = z.infer<typeof dsarReviewDecidedPayloadSchema>;

// ─── 26c. historical_import_validated ─────────────────────────────────────

export const historicalImportValidatedPayloadSchema = z.object({
  user_id: z.string().uuid(),
  total_rows: z.number().int(),
  valid_rows: z.number().int(),
  error_rows: z.number().int(),
});

export type HistoricalImportValidatedPayload = z.infer<typeof historicalImportValidatedPayloadSchema>;

// ─── 26d. historical_import_executed ──────────────────────────────────────

export const historicalImportExecutedPayloadSchema = z.object({
  user_id: z.string().uuid(),
  total_imported: z.number().int(),
  skipped_duplicates: z.number().int(),
});

export type HistoricalImportExecutedPayload = z.infer<typeof historicalImportExecutedPayloadSchema>;

// ─── 27. checkin_alert_generated ───────────────────────────────────────────

export const checkinAlertGeneratedPayloadSchema = z.object({
  checkin_id: z.string().uuid(),
  student_id: z.string().uuid(),
  flag_reason: z.string(),
  auto_concern_id: z.string().uuid(),
});

export type CheckinAlertGeneratedPayload = z.infer<typeof checkinAlertGeneratedPayloadSchema>;

// ─── 28. critical_concern_unacknowledged ───────────────────────────────────

export const criticalConcernUnacknowledgedPayloadSchema = z.object({
  concern_id: z.string().uuid(),
  severity: concernSeveritySchema,
  minutes_elapsed: z.number(),
  notification_round: z.number().int().min(1),
});

export type CriticalConcernUnacknowledgedPayload = z.infer<typeof criticalConcernUnacknowledgedPayloadSchema>;

// ─── 29. intervention_reviewed ────────────────────────────────────────────

export const interventionReviewedPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  old_next_review_date: z.string(),
  new_next_review_date: z.string(),
  review_notes: z.string().optional(),
});

export type InterventionReviewedPayload = z.infer<typeof interventionReviewedPayloadSchema>;

// ─── 30. intervention_progress_added ──────────────────────────────────────

export const interventionProgressAddedPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  progress_id: z.string().uuid(),
  recorded_by_user_id: z.string().uuid(),
  note_preview: z.string(),
});

export type InterventionProgressAddedPayload = z.infer<typeof interventionProgressAddedPayloadSchema>;

// ─── 31. intervention_review_reminder_sent ────────────────────────────────

export const interventionReviewReminderSentPayloadSchema = z.object({
  intervention_id: z.string().uuid(),
  case_id: z.string().uuid(),
  next_review_date: z.string(),
  recipients_count: z.number().int(),
});

export type InterventionReviewReminderSentPayload = z.infer<typeof interventionReviewReminderSentPayloadSchema>;

// ─── 32. critical_incident_declared ───────────────────────────────────────

export const criticalIncidentDeclaredPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  incident_number: z.string(),
  incident_type: z.string(),
  scope: z.string(),
});

export type CriticalIncidentDeclaredPayload = z.infer<typeof criticalIncidentDeclaredPayloadSchema>;

// ─── 33. critical_incident_status_changed ─────────────────────────────────

export const criticalIncidentStatusChangedPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  from_status: z.string(),
  to_status: z.string(),
  reason: z.string(),
});

export type CriticalIncidentStatusChangedPayload = z.infer<typeof criticalIncidentStatusChangedPayloadSchema>;

// ─── 34. critical_incident_updated ────────────────────────────────────────

export const criticalIncidentUpdatedPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  changed_fields: z.array(z.string()),
});

export type CriticalIncidentUpdatedPayload = z.infer<typeof criticalIncidentUpdatedPayloadSchema>;

// ─── 35. response_plan_item_updated / response_plan_item_added ────────────

export const responsePlanItemEventPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  phase: z.string(),
  item_id: z.string().uuid(),
  action: z.string(),
});

export type ResponsePlanItemEventPayload = z.infer<typeof responsePlanItemEventPayloadSchema>;

// ─── 36. affected_person_added / updated / removed ────────────────────────

export const affectedPersonEventPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  affected_person_id: z.string().uuid(),
  person_type: z.string(),
  impact_level: z.string().optional(),
  reason: z.string().optional(),
});

export type AffectedPersonEventPayload = z.infer<typeof affectedPersonEventPayloadSchema>;

// ─── 37. external_support_added / external_support_updated ────────────────

export const externalSupportEventPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  entry_id: z.string().uuid(),
  provider_type: z.string(),
  provider_name: z.string(),
});

export type ExternalSupportEventPayload = z.infer<typeof externalSupportEventPayloadSchema>;

// ─── 38. support_offered ──────────────────────────────────────────────────

export const supportOfferedPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  affected_person_id: z.string().uuid(),
  offered_by_user_id: z.string().uuid(),
});

export type SupportOfferedPayload = z.infer<typeof supportOfferedPayloadSchema>;

// ─── 39. wellbeing_flag_expired ───────────────────────────────────────────

export const wellbeingFlagExpiredPayloadSchema = z.object({
  incident_id: z.string().uuid(),
  student_id: z.string().uuid(),
  expired_at: z.string(),
});

export type WellbeingFlagExpiredPayload = z.infer<typeof wellbeingFlagExpiredPayloadSchema>;

// ─── 40. referral_created ───────────────────────────────────────────────

export const referralCreatedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  student_id: z.string().uuid(),
  referral_type: z.string(),
  created_by: z.string().uuid(),
});

export type ReferralCreatedPayload = z.infer<typeof referralCreatedPayloadSchema>;

// ─── 41. referral_submitted ─────────────────────────────────────────────

export const referralSubmittedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  student_id: z.string().uuid(),
  submitted_at: z.string(),
});

export type ReferralSubmittedPayload = z.infer<typeof referralSubmittedPayloadSchema>;

// ─── 42. referral_acknowledged ──────────────────────────────────────────

export const referralAcknowledgedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  acknowledged_at: z.string(),
});

export type ReferralAcknowledgedPayload = z.infer<typeof referralAcknowledgedPayloadSchema>;

// ─── 43. referral_assessment_scheduled ──────────────────────────────────

export const referralAssessmentScheduledPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  assessment_date: z.string(),
});

export type ReferralAssessmentScheduledPayload = z.infer<typeof referralAssessmentScheduledPayloadSchema>;

// ─── 44. referral_assessment_complete ───────────────────────────────────

export const referralAssessmentCompletePayloadSchema = z.object({
  referral_id: z.string().uuid(),
  completed_at: z.string(),
});

export type ReferralAssessmentCompletePayload = z.infer<typeof referralAssessmentCompletePayloadSchema>;

// ─── 45. referral_report_received ───────────────────────────────────────

export const referralReportReceivedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  received_at: z.string(),
});

export type ReferralReportReceivedPayload = z.infer<typeof referralReportReceivedPayloadSchema>;

// ─── 46. referral_recommendations_implemented ───────────────────────────

export const referralRecommendationsImplementedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
});

export type ReferralRecommendationsImplementedPayload = z.infer<typeof referralRecommendationsImplementedPayloadSchema>;

// ─── 47. referral_withdrawn ─────────────────────────────────────────────

export const referralWithdrawnPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  reason: z.string(),
  withdrawn_by: z.string().uuid(),
});

export type ReferralWithdrawnPayload = z.infer<typeof referralWithdrawnPayloadSchema>;

// ─── 48. referral_pre_populated ─────────────────────────────────────────

export const referralPrePopulatedPayloadSchema = z.object({
  referral_id: z.string().uuid(),
  student_id: z.string().uuid(),
  data_sources_used: z.array(z.string()),
});

export type ReferralPrePopulatedPayload = z.infer<typeof referralPrePopulatedPayloadSchema>;

// ─── 49. recommendation_created ─────────────────────────────────────────

export const recommendationCreatedPayloadSchema = z.object({
  recommendation_id: z.string().uuid(),
  referral_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional(),
});

export type RecommendationCreatedPayload = z.infer<typeof recommendationCreatedPayloadSchema>;

// ─── 50. recommendation_status_changed ──────────────────────────────────

export const recommendationStatusChangedPayloadSchema = z.object({
  recommendation_id: z.string().uuid(),
  old_status: z.string(),
  new_status: z.string(),
  changed_by: z.string().uuid(),
});

export type RecommendationStatusChangedPayload = z.infer<typeof recommendationStatusChangedPayloadSchema>;

// ─── 51. neps_visit_created ─────────────────────────────────────────────

export const nepsVisitCreatedPayloadSchema = z.object({
  visit_id: z.string().uuid(),
  visit_date: z.string(),
  psychologist_name: z.string(),
});

export type NepsVisitCreatedPayload = z.infer<typeof nepsVisitCreatedPayloadSchema>;

// ─── 52. report_generated ───────────────────────────────────────────────

export const reportGeneratedPayloadSchema = z.object({
  report_type: z.string(),
  requested_by: z.string().uuid(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export type ReportGeneratedPayload = z.infer<typeof reportGeneratedPayloadSchema>;

// ─── 53. student_summary_accessed ───────────────────────────────────────

export const studentSummaryAccessedPayloadSchema = z.object({
  student_id: z.string().uuid(),
  accessed_by: z.string().uuid(),
  included_tiers: z.array(z.number()),
});

export type StudentSummaryAccessedPayload = z.infer<typeof studentSummaryAccessedPayloadSchema>;

// ─── Discriminated union of all event payloads ─────────────────────────────

export const pastoralEventPayloadMap = {
  concern_created: concernCreatedPayloadSchema,
  concern_tier_escalated: concernTierEscalatedPayloadSchema,
  concern_narrative_amended: concernNarrativeAmendedPayloadSchema,
  concern_accessed: concernAccessedPayloadSchema,
  concern_note_added: concernNoteAddedPayloadSchema,
  concern_shared_with_parent: concernSharedWithParentPayloadSchema,
  concern_acknowledged: concernAcknowledgedPayloadSchema,
  concern_auto_escalated: concernAutoEscalatedPayloadSchema,
  case_created: caseCreatedPayloadSchema,
  case_status_changed: caseStatusChangedPayloadSchema,
  case_ownership_transferred: caseOwnershipTransferredPayloadSchema,
  intervention_created: interventionCreatedPayloadSchema,
  intervention_status_changed: interventionStatusChangedPayloadSchema,
  intervention_updated: interventionUpdatedPayloadSchema,
  intervention_reviewed: interventionReviewedPayloadSchema,
  intervention_progress_added: interventionProgressAddedPayloadSchema,
  intervention_review_reminder_sent: interventionReviewReminderSentPayloadSchema,
  action_assigned: actionAssignedPayloadSchema,
  action_completed: actionCompletedPayloadSchema,
  action_overdue: actionOverduePayloadSchema,
  parent_contacted: parentContactedPayloadSchema,
  record_exported: recordExportedPayloadSchema,
  cp_access_granted: cpAccessGrantedPayloadSchema,
  cp_access_revoked: cpAccessRevokedPayloadSchema,
  cp_record_accessed: cpRecordAccessedPayloadSchema,
  mandated_report_generated: mandatedReportGeneratedPayloadSchema,
  mandated_report_submitted: mandatedReportSubmittedPayloadSchema,
  dsar_review_routed: dsarReviewRoutedPayloadSchema,
  dsar_review_completed: dsarReviewCompletedPayloadSchema,
  dsar_review_decided: dsarReviewDecidedPayloadSchema,
  historical_import_validated: historicalImportValidatedPayloadSchema,
  historical_import_executed: historicalImportExecutedPayloadSchema,
  checkin_alert_generated: checkinAlertGeneratedPayloadSchema,
  critical_concern_unacknowledged: criticalConcernUnacknowledgedPayloadSchema,
  critical_incident_declared: criticalIncidentDeclaredPayloadSchema,
  critical_incident_status_changed: criticalIncidentStatusChangedPayloadSchema,
  critical_incident_updated: criticalIncidentUpdatedPayloadSchema,
  response_plan_item_updated: responsePlanItemEventPayloadSchema,
  response_plan_item_added: responsePlanItemEventPayloadSchema,
  affected_person_added: affectedPersonEventPayloadSchema,
  affected_person_updated: affectedPersonEventPayloadSchema,
  affected_person_removed: affectedPersonEventPayloadSchema,
  external_support_added: externalSupportEventPayloadSchema,
  external_support_updated: externalSupportEventPayloadSchema,
  support_offered: supportOfferedPayloadSchema,
  wellbeing_flag_expired: wellbeingFlagExpiredPayloadSchema,
  referral_created: referralCreatedPayloadSchema,
  referral_submitted: referralSubmittedPayloadSchema,
  referral_acknowledged: referralAcknowledgedPayloadSchema,
  referral_assessment_scheduled: referralAssessmentScheduledPayloadSchema,
  referral_assessment_complete: referralAssessmentCompletePayloadSchema,
  referral_report_received: referralReportReceivedPayloadSchema,
  referral_recommendations_implemented: referralRecommendationsImplementedPayloadSchema,
  referral_withdrawn: referralWithdrawnPayloadSchema,
  referral_pre_populated: referralPrePopulatedPayloadSchema,
  recommendation_created: recommendationCreatedPayloadSchema,
  recommendation_status_changed: recommendationStatusChangedPayloadSchema,
  neps_visit_created: nepsVisitCreatedPayloadSchema,
  report_generated: reportGeneratedPayloadSchema,
  student_summary_accessed: studentSummaryAccessedPayloadSchema,
} as const;

export type PastoralEventPayloadMap = {
  [K in keyof typeof pastoralEventPayloadMap]: z.infer<(typeof pastoralEventPayloadMap)[K]>;
};

// ─── Create Pastoral Event ─────────────────────────────────────────────────

export const createPastoralEventSchema = z.object({
  event_type: z.string().max(60),
  entity_type: pastoralEntityTypeSchema,
  entity_id: z.string().uuid(),
  student_id: z.string().uuid().optional(),
  tier: pastoralTierSchema,
  payload: z.record(z.string(), z.unknown()),
  ip_address: z.string().optional(),
});

export type CreatePastoralEventDto = z.infer<typeof createPastoralEventSchema>;

// ─── Pastoral Event Filters ────────────────────────────────────────────────

export const pastoralEventFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  entity_type: pastoralEntityTypeSchema.optional(),
  entity_id: z.string().uuid().optional(),
  event_type: z.string().optional(),
  tier: pastoralTierSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PastoralEventFilters = z.infer<typeof pastoralEventFiltersSchema>;
