export type ParentInquiryStatus = 'open' | 'in_progress' | 'closed';
export type InquiryAuthorType = 'parent' | 'admin';

export interface ParentInquiry {
  id: string;
  tenant_id: string;
  parent_id: string;
  student_id: string | null;
  subject: string;
  status: ParentInquiryStatus;
  created_at: string;
  updated_at: string;
  parent?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  student?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  messages?: ParentInquiryMessage[];
  _count?: {
    messages: number;
  };
}

export interface ParentInquiryMessage {
  id: string;
  tenant_id: string;
  inquiry_id: string;
  author_type: InquiryAuthorType;
  author_user_id: string;
  message: string;
  created_at: string;
  author?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}
