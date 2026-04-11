import type { ConversationKind, MessagingRole } from '@school/shared/inbox';

/**
 * Response shapes for the inbox regular-user endpoints. Mirrors the
 * `ConversationsReadFacade` return types on the API with ISO-string dates
 * after JSON serialisation.
 */

export interface InboxThreadSummary {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  last_message_at: string | null;
  frozen_at: string | null;
  unread_count: number;
  muted_at: string | null;
  archived_at: string | null;
  preview_body: string | null;
  preview_sender_user_id: string | null;
  preview_created_at: string | null;
}

export interface ThreadMessageAttachment {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface ThreadMessageView {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: ThreadMessageAttachment[];
  read_state: { read_count: number; total_recipients: number } | null;
}

export interface ThreadParticipant {
  user_id: string;
  role_at_join: MessagingRole;
  joined_at: string;
  last_read_at: string | null;
}

export interface ThreadDetail {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  allow_replies: boolean;
  frozen_at: string | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_by_user_id: string;
  created_at: string;
  participants: ThreadParticipant[];
  messages: {
    data: ThreadMessageView[];
    meta: { page: number; pageSize: number; total: number };
  };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export type InboxFilterKind = 'direct' | 'group' | 'broadcast';
