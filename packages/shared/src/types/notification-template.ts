export interface NotificationTemplate {
  id: string;
  tenant_id: string | null;
  channel: 'email' | 'whatsapp' | 'in_app';
  template_key: string;
  locale: string;
  subject_template: string | null;
  body_template: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}
