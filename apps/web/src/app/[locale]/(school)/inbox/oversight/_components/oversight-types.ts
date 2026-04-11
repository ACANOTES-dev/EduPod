// Response shapes returned by the `/v1/inbox/oversight/*` endpoints.
// Mirror the service types in `apps/api/src/modules/inbox/oversight/
// inbox-oversight.service.ts`. ISO strings on the wire; dates are parsed
// on render.

export type ConversationKind = 'direct' | 'group' | 'broadcast';

export type MessageFlagReviewState = 'pending' | 'dismissed' | 'escalated' | 'frozen';

export type OversightAuditAction =
  | 'read_thread'
  | 'freeze'
  | 'unfreeze'
  | 'dismiss_flag'
  | 'escalate_flag'
  | 'export_thread'
  | 'search';

export interface OversightThreadSummary {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  frozen_at: string | null;
  last_message_at: string | null;
  created_at: string;
  participant_count: number;
  flag_count: number;
  has_pending_flag: boolean;
}

export interface OversightFlagSummary {
  id: string;
  conversation_id: string;
  message_id: string;
  matched_keywords: string[];
  highest_severity: string;
  review_state: MessageFlagReviewState;
  body_preview: string;
  created_at: string;
  participants: Array<{ user_id: string; display_name: string }>;
  review_url: string;
}

export interface OversightAuditEntry {
  id: string;
  actor_user_id: string;
  action: OversightAuditAction;
  conversation_id: string | null;
  message_flag_id: string | null;
  metadata_json: unknown;
  created_at: string;
}

export interface OversightThreadDetail {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  frozen_at: string | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_at: string;
  participants: Array<{
    id: string;
    user_id: string;
    role_at_join: string;
    display_name: string;
  }>;
  messages: Array<{
    id: string;
    sender_user_id: string;
    sender_display_name: string;
    body: string;
    created_at: string;
    deleted_at: string | null;
    edits: Array<{
      id: string;
      previous_body: string;
      edited_at: string;
      edited_by_user_id: string;
    }>;
  }>;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
