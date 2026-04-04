import { $Enums } from '@prisma/client';

// ─── Prisma → Domain enum maps ──────────────────────────────────────────────

export const SEVERITY_TO_PRISMA: Record<string, $Enums.SafeguardingSeverity> = {
  low: 'low_sev' as $Enums.SafeguardingSeverity,
  medium: 'medium_sev' as $Enums.SafeguardingSeverity,
  high: 'high_sev' as $Enums.SafeguardingSeverity,
  critical: 'critical_sev' as $Enums.SafeguardingSeverity,
};

export const PRISMA_TO_SEVERITY: Record<string, string> = {
  low_sev: 'low',
  medium_sev: 'medium',
  high_sev: 'high',
  critical_sev: 'critical',
};

export const STATUS_TO_PRISMA: Record<string, $Enums.SafeguardingStatus> = {
  reported: 'reported' as $Enums.SafeguardingStatus,
  acknowledged: 'acknowledged' as $Enums.SafeguardingStatus,
  under_investigation: 'under_investigation' as $Enums.SafeguardingStatus,
  referred: 'referred' as $Enums.SafeguardingStatus,
  monitoring: 'sg_monitoring' as $Enums.SafeguardingStatus,
  resolved: 'sg_resolved' as $Enums.SafeguardingStatus,
  sealed: 'sealed' as $Enums.SafeguardingStatus,
};

export const PRISMA_TO_STATUS: Record<string, string> = {
  reported: 'reported',
  acknowledged: 'acknowledged',
  under_investigation: 'under_investigation',
  referred: 'referred',
  sg_monitoring: 'monitoring',
  sg_resolved: 'resolved',
  sealed: 'sealed',
};

export const CONCERN_TYPE_TO_PRISMA: Record<string, $Enums.SafeguardingConcernType> = {
  physical_abuse: 'physical_abuse' as $Enums.SafeguardingConcernType,
  emotional_abuse: 'emotional_abuse' as $Enums.SafeguardingConcernType,
  sexual_abuse: 'sexual_abuse' as $Enums.SafeguardingConcernType,
  neglect: 'neglect' as $Enums.SafeguardingConcernType,
  self_harm: 'self_harm' as $Enums.SafeguardingConcernType,
  bullying: 'bullying' as $Enums.SafeguardingConcernType,
  online_safety: 'online_safety' as $Enums.SafeguardingConcernType,
  domestic_violence: 'domestic_violence' as $Enums.SafeguardingConcernType,
  substance_abuse: 'substance_abuse' as $Enums.SafeguardingConcernType,
  mental_health: 'mental_health' as $Enums.SafeguardingConcernType,
  radicalisation: 'radicalisation' as $Enums.SafeguardingConcernType,
  other: 'other_concern' as $Enums.SafeguardingConcernType,
};

export const PRISMA_TO_CONCERN_TYPE: Record<string, string> = {
  physical_abuse: 'physical_abuse',
  emotional_abuse: 'emotional_abuse',
  sexual_abuse: 'sexual_abuse',
  neglect: 'neglect',
  self_harm: 'self_harm',
  bullying: 'bullying',
  online_safety: 'online_safety',
  domestic_violence: 'domestic_violence',
  substance_abuse: 'substance_abuse',
  mental_health: 'mental_health',
  radicalisation: 'radicalisation',
  other_concern: 'other',
};

export const ACK_STATUS_TO_PRISMA: Record<string, $Enums.ReporterAckStatus> = {
  received: 'received' as $Enums.ReporterAckStatus,
  assigned: 'assigned_ack' as $Enums.ReporterAckStatus,
  under_review: 'under_review_ack' as $Enums.ReporterAckStatus,
};

export const PRISMA_TO_ACK_STATUS: Record<string, string> = {
  received: 'received',
  assigned_ack: 'assigned',
  under_review_ack: 'under_review',
};

export const ACTION_TYPE_TO_PRISMA: Record<string, $Enums.SafeguardingActionType> = {
  note_added: 'note_added' as $Enums.SafeguardingActionType,
  status_changed: 'status_changed' as $Enums.SafeguardingActionType,
  assigned: 'assigned' as $Enums.SafeguardingActionType,
  meeting_held: 'meeting_held' as $Enums.SafeguardingActionType,
  parent_contacted: 'parent_contacted' as $Enums.SafeguardingActionType,
  agency_contacted: 'agency_contacted' as $Enums.SafeguardingActionType,
  tusla_referred: 'tusla_referred' as $Enums.SafeguardingActionType,
  garda_referred: 'garda_referred' as $Enums.SafeguardingActionType,
  document_uploaded: 'document_uploaded' as $Enums.SafeguardingActionType,
  document_downloaded: 'document_downloaded' as $Enums.SafeguardingActionType,
  review_completed: 'review_completed' as $Enums.SafeguardingActionType,
};

export const PRISMA_TO_ACTION_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_TYPE_TO_PRISMA).map(([k, v]) => [v, k]),
);

// ─── Behaviour → Pastoral severity mapping ──────────────────────────────────

export const BEHAVIOUR_TO_PASTORAL_SEVERITY: Record<string, string> = {
  low: 'routine',
  medium: 'elevated',
  high: 'urgent',
  critical: 'critical',
};

// ─── Behaviour → Pastoral status mapping ─────────────────────────────────────

export const BEHAVIOUR_TO_PASTORAL_STATUS: Record<string, string> = {
  reported: 'routine',
  acknowledged: 'routine',
  under_investigation: 'elevated',
  referred: 'elevated',
  monitoring: 'monitoring',
  resolved: 'resolved',
  sealed: 'resolved',
};
