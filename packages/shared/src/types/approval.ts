export type ApprovalActionType =
  | 'announcement_publish'
  | 'invoice_issue'
  | 'application_accept'
  | 'payment_refund'
  | 'payroll_finalise';

export type ApprovalRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled'
  | 'expired';

export interface ApprovalWorkflow {
  id: string;
  tenant_id: string;
  action_type: ApprovalActionType;
  approver_role_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ApprovalCallbackStatus = 'pending' | 'executed' | 'failed';

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  action_type: ApprovalActionType;
  target_entity_type: string;
  target_entity_id: string;
  requester_user_id: string;
  approver_user_id: string | null;
  status: ApprovalRequestStatus;
  request_comment: string | null;
  decision_comment: string | null;
  submitted_at: string;
  decided_at: string | null;
  executed_at: string | null;
  callback_status: ApprovalCallbackStatus | null;
  callback_error: string | null;
  callback_attempts: number;
  created_at: string;
  updated_at: string;
}
