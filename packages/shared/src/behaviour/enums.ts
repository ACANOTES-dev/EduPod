export const BEHAVIOUR_POLARITY = ['positive', 'negative', 'neutral'] as const;
export type BehaviourPolarity = (typeof BEHAVIOUR_POLARITY)[number];

export const BENCHMARK_CATEGORY = [
  'praise', 'merit', 'minor_positive', 'major_positive',
  'verbal_warning', 'written_warning', 'detention',
  'internal_suspension', 'external_suspension', 'expulsion',
  'note', 'observation', 'other',
] as const;
export type BenchmarkCategory = (typeof BENCHMARK_CATEGORY)[number];

export const INCIDENT_STATUS = [
  'draft', 'active', 'investigating', 'under_review',
  'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
  'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
  'converted_to_safeguarding',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

export const INCIDENT_APPROVAL_STATUS = ['not_required', 'pending', 'approved', 'rejected'] as const;
export type IncidentApprovalStatus = (typeof INCIDENT_APPROVAL_STATUS)[number];

export const PARENT_NOTIF_STATUS = [
  'not_required', 'pending', 'sent', 'delivered', 'failed', 'acknowledged',
] as const;
export type ParentNotifStatus = (typeof PARENT_NOTIF_STATUS)[number];

export const CONTEXT_TYPE = [
  'class', 'break', 'before_school', 'after_school', 'lunch',
  'transport', 'extra_curricular', 'off_site', 'online', 'other',
] as const;
export type ContextType = (typeof CONTEXT_TYPE)[number];

export const PARTICIPANT_TYPE = ['student', 'staff', 'parent', 'visitor', 'unknown'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPE)[number];

export const PARTICIPANT_ROLE = [
  'subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator',
] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLE)[number];

export const BEHAVIOUR_ENTITY_TYPE = [
  'incident', 'sanction', 'intervention', 'appeal', 'task',
  'exclusion_case', 'publication_approval', 'break_glass_grant', 'guardian_restriction',
] as const;
export type BehaviourEntityType = (typeof BEHAVIOUR_ENTITY_TYPE)[number];

export const BEHAVIOUR_TASK_TYPE = [
  'follow_up', 'intervention_review', 'parent_meeting', 'parent_acknowledgement',
  'approval_action', 'sanction_supervision', 'return_check_in', 'safeguarding_action',
  'document_requested', 'appeal_review', 'break_glass_review',
  'guardian_restriction_review', 'custom',
] as const;
export type BehaviourTaskType = (typeof BEHAVIOUR_TASK_TYPE)[number];

export const BEHAVIOUR_TASK_ENTITY_TYPE = [
  'incident', 'sanction', 'intervention', 'safeguarding_concern',
  'appeal', 'break_glass_grant', 'exclusion_case', 'guardian_restriction',
] as const;
export type BehaviourTaskEntityType = (typeof BEHAVIOUR_TASK_ENTITY_TYPE)[number];

export const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const BEHAVIOUR_TASK_STATUS = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'] as const;
export type BehaviourTaskStatus = (typeof BEHAVIOUR_TASK_STATUS)[number];

export const BEHAVIOUR_CHANGE_TYPE = [
  'created', 'status_changed', 'updated', 'participant_added',
  'participant_removed', 'sanction_created', 'follow_up_recorded',
  'escalated', 'withdrawn', 'attachment_added',
  'policy_action_applied', 'appeal_outcome', 'parent_description_set',
  'admin_approved', 'amendment_created', 'cancelled', 'completed',
  'correction_sent', 'decided', 'decision_recorded',
  'document_finalised', 'document_generated', 'document_printed',
  'document_sent', 'expired', 'legal_hold_released', 'legal_hold_set',
  'rejected', 'revoked', 'anonymised',
] as const;
export type BehaviourChangeType = (typeof BEHAVIOUR_CHANGE_TYPE)[number];

export const RETENTION_STATUS = ['active', 'archived', 'anonymised'] as const;
export type RetentionStatus = (typeof RETENTION_STATUS)[number];

export const BEHAVIOUR_SCOPE = ['own', 'class', 'year_group', 'pastoral', 'all'] as const;
export type BehaviourScope = (typeof BEHAVIOUR_SCOPE)[number];

export const ACKNOWLEDGEMENT_CHANNEL = ['email', 'whatsapp', 'in_app'] as const;
export type AcknowledgementChannel = (typeof ACKNOWLEDGEMENT_CHANNEL)[number];

export const ACKNOWLEDGEMENT_METHOD = ['in_app_button', 'email_link', 'whatsapp_reply'] as const;
export type AcknowledgementMethod = (typeof ACKNOWLEDGEMENT_METHOD)[number];
