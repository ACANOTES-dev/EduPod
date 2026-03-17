export type ContactFormStatus = 'new' | 'reviewed' | 'closed' | 'spam';

export interface ContactFormSubmission {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  source_ip: string | null;
  status: ContactFormStatus;
  created_at: string;
  updated_at: string;
}
