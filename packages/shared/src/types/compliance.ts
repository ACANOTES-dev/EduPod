export type ComplianceRequestType = 'access_export' | 'erasure' | 'rectification' | 'portability';
export type ComplianceSubjectType = 'parent' | 'student' | 'household' | 'user' | 'staff' | 'applicant';
export type ComplianceRequestStatus = 'submitted' | 'classified' | 'approved' | 'rejected' | 'completed';
export type ComplianceClassification = 'erase' | 'anonymise' | 'retain_legal_basis';

export interface ComplianceRequest {
  id: string;
  tenant_id: string;
  request_type: ComplianceRequestType;
  subject_type: ComplianceSubjectType;
  subject_id: string;
  requested_by_user_id: string;
  status: ComplianceRequestStatus;
  classification: ComplianceClassification | null;
  decision_notes: string | null;
  export_file_key: string | null;
  deadline_at: string | null;
  extension_granted: boolean;
  extension_reason: string | null;
  extension_deadline_at: string | null;
  deadline_exceeded: boolean;
  rectification_note: string | null;
  created_at: string;
  updated_at: string;
}
