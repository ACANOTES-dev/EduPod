export type ContactChannel = 'email' | 'whatsapp';

export interface Parent {
  id: string;
  tenant_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_contact_channels: ContactChannel[];
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  role_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentLinkedHousehold {
  household_id: string;
  household_name: string;
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface ParentLinkedStudent {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  status: string;
  relationship_label: string | null;
}

export interface ParentDetail extends Parent {
  households: ParentLinkedHousehold[];
  students: ParentLinkedStudent[];
}
