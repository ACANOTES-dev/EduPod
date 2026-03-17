export interface HouseholdEmergencyContact {
  id: string;
  household_id: string;
  contact_name: string;
  phone: string;
  relationship_label: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface HouseholdParent {
  id: string;
  household_id: string;
  parent_id: string;
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  tenant_id: string;
  household_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseholdDetail extends Household {
  parents: HouseholdParent[];
  emergency_contacts: HouseholdEmergencyContact[];
  student_count: number;
}
