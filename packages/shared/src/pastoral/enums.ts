import { z } from 'zod';

// ─── Severity ──────────────────────────────────────────────────────────────

export const CONCERN_SEVERITIES = ['routine', 'elevated', 'urgent', 'critical'] as const;
export const concernSeveritySchema = z.enum(CONCERN_SEVERITIES);
export type ConcernSeverity = z.infer<typeof concernSeveritySchema>;

// ─── Tiers ─────────────────────────────────────────────────────────────────

export const PASTORAL_TIERS = [1, 2, 3] as const;
export const pastoralTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type PastoralTier = z.infer<typeof pastoralTierSchema>;

// ─── Case Status ───────────────────────────────────────────────────────────

export const CASE_STATUSES = ['open', 'active', 'monitoring', 'resolved', 'closed'] as const;
export const caseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

// ─── Intervention Status ───────────────────────────────────────────────────

export const INTERVENTION_STATUSES = ['active', 'achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn'] as const;
export const interventionStatusSchema = z.enum(INTERVENTION_STATUSES);
export type PastoralInterventionStatus = z.infer<typeof interventionStatusSchema>;

// ─── Action Status ─────────────────────────────────────────────────────────

export const ACTION_STATUSES = ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'] as const;
export const actionStatusSchema = z.enum(ACTION_STATUSES);
export type PastoralActionStatus = z.infer<typeof actionStatusSchema>;

// ─── Referral Status ───────────────────────────────────────────────────────

export const REFERRAL_STATUSES = ['draft', 'submitted', 'acknowledged', 'assessment_scheduled', 'assessment_complete', 'report_received', 'recommendations_implemented'] as const;
export const referralStatusSchema = z.enum(REFERRAL_STATUSES);
export type PastoralReferralStatus = z.infer<typeof referralStatusSchema>;

// ─── Referral Recommendation Status ────────────────────────────────────────

export const REFERRAL_RECOMMENDATION_STATUSES = ['pending', 'in_progress', 'implemented', 'not_applicable'] as const;
export const referralRecommendationStatusSchema = z.enum(REFERRAL_RECOMMENDATION_STATUSES);
export type PastoralReferralRecommendationStatus = z.infer<typeof referralRecommendationStatusSchema>;

// ─── SST Meeting Status ────────────────────────────────────────────────────

export const SST_MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export const sstMeetingStatusSchema = z.enum(SST_MEETING_STATUSES);
export type SstMeetingStatus = z.infer<typeof sstMeetingStatusSchema>;

// ─── CP Record Type ────────────────────────────────────────────────────────

export const CP_RECORD_TYPES = ['concern', 'mandated_report', 'tusla_correspondence', 'section_26', 'disclosure', 'retrospective_disclosure'] as const;
export const cpRecordTypeSchema = z.enum(CP_RECORD_TYPES);
export type CpRecordType = z.infer<typeof cpRecordTypeSchema>;

// ─── Mandated Report Status ────────────────────────────────────────────────

export const MANDATED_REPORT_STATUSES = ['draft', 'submitted', 'acknowledged', 'outcome_received'] as const;
export const mandatedReportStatusSchema = z.enum(MANDATED_REPORT_STATUSES);
export type MandatedReportStatus = z.infer<typeof mandatedReportStatusSchema>;

// ─── Contact Method ────────────────────────────────────────────────────────

export const CONTACT_METHODS = ['phone', 'in_person', 'email', 'portal_message', 'letter'] as const;
export const contactMethodSchema = z.enum(CONTACT_METHODS);
export type ContactMethod = z.infer<typeof contactMethodSchema>;

// ─── Parent Share Level ────────────────────────────────────────────────────

export const PARENT_SHARE_LEVELS = ['category_only', 'category_summary', 'full_detail'] as const;
export const parentShareLevelSchema = z.enum(PARENT_SHARE_LEVELS);
export type ParentShareLevel = z.infer<typeof parentShareLevelSchema>;

// ─── Action Frequency ──────────────────────────────────────────────────────

export const ACTION_FREQUENCIES = ['once', 'daily', 'weekly', 'fortnightly', 'as_needed'] as const;
export const actionFrequencySchema = z.enum(ACTION_FREQUENCIES);
export type ActionFrequency = z.infer<typeof actionFrequencySchema>;

// ─── Referral Type ─────────────────────────────────────────────────────────

export const REFERRAL_TYPES = ['neps', 'camhs', 'tusla_family_support', 'jigsaw', 'pieta_house', 'other_external'] as const;
export const referralTypeSchema = z.enum(REFERRAL_TYPES);
export type ReferralType = z.infer<typeof referralTypeSchema>;

// ─── Agenda Item Source ────────────────────────────────────────────────────

export const AGENDA_ITEM_SOURCES = ['auto_new_concern', 'auto_case_review', 'auto_overdue_action', 'auto_early_warning', 'auto_neps', 'auto_intervention_review', 'manual'] as const;
export const agendaItemSourceSchema = z.enum(AGENDA_ITEM_SOURCES);
export type AgendaItemSource = z.infer<typeof agendaItemSourceSchema>;

// ─── Export Purpose ────────────────────────────────────────────────────────

export const EXPORT_PURPOSES = ['tusla_request', 'section_26_inquiry', 'legal_proceedings', 'school_transfer_cp', 'board_of_management', 'other'] as const;
export const exportPurposeSchema = z.enum(EXPORT_PURPOSES);
export type ExportPurpose = z.infer<typeof exportPurposeSchema>;

// ─── DSAR Decision ─────────────────────────────────────────────────────────

export const DSAR_DECISIONS = ['include', 'redact', 'exclude'] as const;
export const dsarDecisionSchema = z.enum(DSAR_DECISIONS);
export type DsarDecision = z.infer<typeof dsarDecisionSchema>;

// ─── Critical Incident Type ────────────────────────────────────────────────

export const CRITICAL_INCIDENT_TYPES = ['bereavement', 'serious_accident', 'community_trauma', 'other'] as const;
export const criticalIncidentTypeSchema = z.enum(CRITICAL_INCIDENT_TYPES);
export type CriticalIncidentType = z.infer<typeof criticalIncidentTypeSchema>;

// ─── Critical Incident Scope ───────────────────────────────────────────────

export const CRITICAL_INCIDENT_SCOPES = ['whole_school', 'year_group', 'class_group', 'individual'] as const;
export const criticalIncidentScopeSchema = z.enum(CRITICAL_INCIDENT_SCOPES);
export type CriticalIncidentScope = z.infer<typeof criticalIncidentScopeSchema>;

// ─── Critical Incident Status ──────────────────────────────────────────────

export const CRITICAL_INCIDENT_STATUSES = ['active', 'monitoring', 'closed'] as const;
export const criticalIncidentStatusSchema = z.enum(CRITICAL_INCIDENT_STATUSES);
export type CriticalIncidentStatus = z.infer<typeof criticalIncidentStatusSchema>;

// ─── Critical Incident Impact Level ────────────────────────────────────────

export const CRITICAL_INCIDENT_IMPACT_LEVELS = ['direct', 'indirect'] as const;
export const criticalIncidentImpactLevelSchema = z.enum(CRITICAL_INCIDENT_IMPACT_LEVELS);
export type CriticalIncidentImpactLevel = z.infer<typeof criticalIncidentImpactLevelSchema>;

// ─── Concern Source ────────────────────────────────────────────────────────

export const CONCERN_SOURCES = ['manual', 'historical_import', 'auto_checkin', 'parent_self_referral'] as const;
export const concernSourceSchema = z.enum(CONCERN_SOURCES);
export type ConcernSource = z.infer<typeof concernSourceSchema>;

// ─── Pastoral Entity Type (for events and DSAR) ───────────────────────────

export const PASTORAL_ENTITY_TYPES = ['concern', 'case', 'intervention', 'referral', 'cp_record', 'checkin', 'critical_incident', 'cp_access_grant', 'dsar_review', 'export'] as const;
export const pastoralEntityTypeSchema = z.enum(PASTORAL_ENTITY_TYPES);
export type PastoralEntityType = z.infer<typeof pastoralEntityTypeSchema>;

// ─── Checkin Flag Reason ───────────────────────────────────────────────────

export const CHECKIN_FLAG_REASONS = ['keyword_match', 'consecutive_low'] as const;
export const checkinFlagReasonSchema = z.enum(CHECKIN_FLAG_REASONS);
export type CheckinFlagReason = z.infer<typeof checkinFlagReasonSchema>;

// ─── Affected Type (Critical Incident) ─────────────────────────────────────

export const AFFECTED_TYPES = ['student', 'staff'] as const;
export const affectedTypeSchema = z.enum(AFFECTED_TYPES);
export type AffectedType = z.infer<typeof affectedTypeSchema>;

// ─── Pastoral Event Types ──────────────────────────────────────────────────

export const PASTORAL_EVENT_TYPES = [
  'concern_created',
  'concern_tier_escalated',
  'concern_narrative_amended',
  'concern_accessed',
  'concern_note_added',
  'concern_shared_with_parent',
  'concern_acknowledged',
  'concern_auto_escalated',
  'case_created',
  'case_status_changed',
  'case_ownership_transferred',
  'intervention_created',
  'intervention_status_changed',
  'intervention_updated',
  'intervention_reviewed',
  'intervention_progress_added',
  'intervention_review_reminder_sent',
  'action_assigned',
  'action_completed',
  'action_overdue',
  'parent_contacted',
  'record_exported',
  'cp_access_granted',
  'cp_access_revoked',
  'cp_record_accessed',
  'mandated_report_generated',
  'mandated_report_submitted',
  'dsar_review_routed',
  'dsar_review_completed',
  'checkin_alert_generated',
  'critical_concern_unacknowledged',
  'critical_incident_declared',
  'critical_incident_status_changed',
  'critical_incident_updated',
  'response_plan_item_updated',
  'response_plan_item_added',
  'affected_person_added',
  'affected_person_updated',
  'affected_person_removed',
  'external_support_added',
  'external_support_updated',
  'support_offered',
  'wellbeing_flag_expired',
] as const;
export const pastoralEventTypeSchema = z.enum(PASTORAL_EVENT_TYPES);
export type PastoralEventType = z.infer<typeof pastoralEventTypeSchema>;

// ─── SST Auto Agenda Source ────────────────────────────────────────────────

export const SST_AUTO_AGENDA_SOURCES = ['new_concerns', 'case_reviews', 'overdue_actions', 'early_warning', 'neps', 'intervention_reviews'] as const;
export const sstAutoAgendaSourceSchema = z.enum(SST_AUTO_AGENDA_SOURCES);
export type SstAutoAgendaSource = z.infer<typeof sstAutoAgendaSourceSchema>;

// ─── Checkin Frequency ─────────────────────────────────────────────────────

export const CHECKIN_FREQUENCIES = ['daily', 'weekly'] as const;
export const checkinFrequencySchema = z.enum(CHECKIN_FREQUENCIES);
export type CheckinFrequency = z.infer<typeof checkinFrequencySchema>;

// ─── SST Meeting Frequency ─────────────────────────────────────────────────

export const SST_MEETING_FREQUENCIES = ['weekly', 'fortnightly', 'monthly'] as const;
export const sstMeetingFrequencySchema = z.enum(SST_MEETING_FREQUENCIES);
export type SstMeetingFrequency = z.infer<typeof sstMeetingFrequencySchema>;

// ─── Action Source ─────────────────────────────────────────────────────────

export const ACTION_SOURCES = ['intervention', 'meeting'] as const;
export const actionSourceSchema = z.enum(ACTION_SOURCES);
export type ActionSource = z.infer<typeof actionSourceSchema>;

// ─── Default Concern Categories ────────────────────────────────────────────

export const DEFAULT_CONCERN_CATEGORIES = [
  { key: 'academic', label: 'Academic', auto_tier: undefined, active: true },
  { key: 'social', label: 'Social', auto_tier: undefined, active: true },
  { key: 'emotional', label: 'Emotional', auto_tier: undefined, active: true },
  { key: 'behavioural', label: 'Behavioural', auto_tier: undefined, active: true },
  { key: 'attendance', label: 'Attendance', auto_tier: undefined, active: true },
  { key: 'family_home', label: 'Family / Home', auto_tier: undefined, active: true },
  { key: 'health', label: 'Health', auto_tier: undefined, active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', auto_tier: undefined, active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
  { key: 'other', label: 'Other', auto_tier: undefined, active: true },
] as const;

// ─── Default Intervention Types ────────────────────────────────────────────

export const DEFAULT_INTERVENTION_TYPES = [
  { key: 'academic_support', label: 'Academic Support', active: true },
  { key: 'behavioural_support', label: 'Behavioural Support', active: true },
  { key: 'social_emotional', label: 'Social-Emotional Support', active: true },
  { key: 'attendance_support', label: 'Attendance Support', active: true },
  { key: 'external_referral', label: 'External Referral', active: true },
  { key: 'reasonable_accommodation', label: 'Reasonable Accommodation', active: true },
  { key: 'safety_plan', label: 'Safety Plan', active: true },
] as const;

// ─── Default Flagged Keywords (for check-in alerts) ────────────────────────

export const DEFAULT_FLAGGED_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'want to die', 'self-harm',
  'cutting', 'hurt myself', 'no point', 'not worth it', 'nobody cares',
] as const;
