export interface ParentFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  relationship_label: string;
}

export interface HouseholdFormData {
  household_name: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  country: string;
  postal_code: string;
}

export interface EmergencyContactData {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

export interface StudentFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  year_group_id: string;
  national_id: string;
  isComplete: boolean;
}

export interface FeePreviewStudent {
  student_index: number;
  year_group_name: string;
  fees: {
    fee_structure_id: string;
    name: string;
    billing_frequency: string;
    base_amount: number;
    annual_amount: number;
  }[];
  subtotal: number;
}

export interface AvailableDiscount {
  discount_id: string;
  name: string;
  discount_type: 'fixed' | 'percent';
  value: number;
}

export interface FeePreviewResult {
  students: FeePreviewStudent[];
  available_discounts: AvailableDiscount[];
  grand_total: number;
}

export interface RegistrationResult {
  household: { id: string; household_number: string; household_name: string };
  parents: { id: string; first_name: string; last_name: string }[];
  students: {
    id: string;
    student_number: string;
    first_name: string;
    last_name: string;
  }[];
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    balance_amount: number;
    status: string;
  };
}

export interface PaymentResult {
  id: string;
  amount: number;
  payment_method: string;
  receipt_id?: string;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  primaryParent: ParentFormData;
  secondaryParent: ParentFormData | null;
  showSecondaryParent: boolean;
  household: HouseholdFormData;
  emergencyContacts: EmergencyContactData[];
  students: StudentFormData[];
  expandedStudentIndex: number;
  feePreview: FeePreviewResult | null;
  removedFees: string[];
  appliedDiscounts: { discount_id: string; fee_assignment_index: number }[];
  adhocAdjustments: { label: string; amount: number }[];
  registrationResult: RegistrationResult | null;
  paymentResult: PaymentResult | null;
  isLoading: boolean;
  error: string | null;
}

export type WizardAction =
  | { type: 'SET_STEP'; step: WizardState['step'] }
  | { type: 'SET_PRIMARY_PARENT'; data: Partial<ParentFormData> }
  | { type: 'SET_SECONDARY_PARENT'; data: Partial<ParentFormData> | null }
  | { type: 'TOGGLE_SECONDARY_PARENT' }
  | { type: 'SET_HOUSEHOLD'; data: Partial<HouseholdFormData> }
  | { type: 'SET_EMERGENCY_CONTACTS'; contacts: EmergencyContactData[] }
  | { type: 'ADD_STUDENT' }
  | { type: 'REMOVE_STUDENT'; index: number }
  | { type: 'UPDATE_STUDENT'; index: number; data: Partial<StudentFormData> }
  | { type: 'SET_EXPANDED_STUDENT'; index: number }
  | { type: 'SET_FEE_PREVIEW'; preview: FeePreviewResult }
  | { type: 'REMOVE_FEE'; feeStructureId: string }
  | { type: 'RESTORE_FEE'; feeStructureId: string }
  | { type: 'ADD_DISCOUNT'; discount_id: string; fee_assignment_index: number }
  | { type: 'REMOVE_DISCOUNT'; index: number }
  | { type: 'ADD_ADHOC_ADJUSTMENT'; label: string; amount: number }
  | { type: 'REMOVE_ADHOC_ADJUSTMENT'; index: number }
  | { type: 'SET_REGISTRATION_RESULT'; result: RegistrationResult }
  | { type: 'SET_PAYMENT_RESULT'; result: PaymentResult }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

export const EMPTY_PARENT: ParentFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  relationship_label: '',
};

export const EMPTY_STUDENT: StudentFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  year_group_id: '',
  national_id: '',
  isComplete: false,
};
