export type AnnouncementStatus = 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'archived';
export type AnnouncementScope = 'school' | 'year_group' | 'class' | 'household' | 'custom';

export interface Announcement {
  id: string;
  tenant_id: string;
  title: string;
  body_html: string;
  status: AnnouncementStatus;
  scope: AnnouncementScope;
  target_payload: Record<string, unknown>;
  scheduled_publish_at: string | null;
  published_at: string | null;
  author_user_id: string;
  approval_request_id: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface DeliveryStatusSummary {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  read: number;
}
