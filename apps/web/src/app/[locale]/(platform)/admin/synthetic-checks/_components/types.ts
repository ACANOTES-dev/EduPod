export type SyntheticCheckKind =
  | 'http_get'
  | 'http_post'
  | 'websocket_handshake'
  | 'queue_canary'
  | 'notification_self_test'
  | 'dns_lookup'
  | 'tls_check'
  | 'external_dependency_status';

export type SyntheticCheckResultStatus =
  | 'passed'
  | 'degraded'
  | 'failed'
  | 'error'
  | 'skipped_maintenance';

export interface SyntheticCheckResult {
  id: string;
  definition_id: string;
  status: SyntheticCheckResultStatus;
  latency_ms: number | null;
  response_status_code: number | null;
  response_body_sha256: string | null;
  response_body_snippet: string | null;
  failure_detail: Record<string, unknown> | null;
  attempt_number: number;
  triggered_by: string;
  triggered_by_user_id: string | null;
  correlation_id: string | null;
  ran_at: string;
}

export interface SyntheticCheckDefinition {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  kind: SyntheticCheckKind;
  target: Record<string, unknown>;
  expected: Record<string, unknown>;
  schedule_cron: string;
  timeout_ms: number;
  consecutive_failure_threshold_critical: number;
  retry_attempts: number;
  related_component: string | null;
  related_tenant_id: string | null;
  enabled: boolean;
  uptime_24h?: number;
  last_result?: SyntheticCheckResult | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
