// Wire contract for the behaviour-document surfaces. Matches what
// `BehaviourDocumentService.serializeDocument()` emits through the
// `ResponseTransformInterceptor` — see
// apps/api/src/modules/behaviour/behaviour-document.service.ts.

export const DOCUMENT_TYPES = [
  'detention_notice',
  'suspension_letter',
  'return_meeting_letter',
  'behaviour_contract',
  'intervention_summary',
  'appeal_hearing_invite',
  'appeal_decision_letter',
  'exclusion_notice',
  'exclusion_decision_letter',
  'board_pack',
  'custom_document',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Wire-level status (after the service's `mapStatusToApi`). Note: the backend
// emits `generating` during the PDF render window even though the generic
// schema only lists `draft | finalised | sent | superseded` — impl 06 did not
// ship a dedicated `generation_failed` state yet.
export const DOCUMENT_STATUSES = [
  'generating',
  'draft',
  'finalised',
  'sent',
  'superseded',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_ENTITY_TYPES = [
  'incident',
  'sanction',
  'intervention',
  'appeal',
  'exclusion_case',
] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

// Backend accepts `email | whatsapp | in_app | print`. There is no SMS channel
// today; impl 20 kept the UI aligned with what the backend actually ships.
export const DOCUMENT_SEND_CHANNELS = ['in_app', 'email', 'whatsapp', 'print'] as const;

export type DocumentSendChannel = (typeof DOCUMENT_SEND_CHANNELS)[number];

export interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
}

export interface DocumentRow {
  id: string;
  document_type: DocumentType;
  status: DocumentStatus;
  entity_type: DocumentEntityType;
  entity_id: string;
  student_id: string;
  generated_at: string;
  sent_at: string | null;
  sent_via: string | null;
  locale: string;
  student: PersonRef | null;
  generated_by: PersonRef | null;
  template: { id: string; name: string } | null;
}

export interface DocumentTemplate {
  id: string;
  document_type: DocumentType;
  name: string;
  locale: string;
  is_active: boolean;
  is_system: boolean;
  merge_fields: Array<{ field_name: string; source: string; description: string }>;
}

export interface StudentParentOption {
  parent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  has_user_account: boolean;
}
