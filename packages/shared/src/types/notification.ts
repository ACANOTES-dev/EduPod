export type NotificationChannel = 'email' | 'whatsapp' | 'in_app' | 'sms';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'read';

export interface Notification {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  channel: NotificationChannel;
  template_key: string | null;
  locale: string;
  status: NotificationStatus;
  provider_message_id: string | null;
  payload_json: Record<string, unknown>;
  source_entity_type: string | null;
  source_entity_id: string | null;
  failure_reason: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}
