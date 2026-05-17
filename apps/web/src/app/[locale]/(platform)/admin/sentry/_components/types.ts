export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface SentryIssue {
  id: string;
  sentry_issue_id: string;
  sentry_project: string;
  permalink: string;
  title: string;
  culprit: string | null;
  fingerprint: string[];
  release: string | null;
  environment: string | null;
  level: string | null;
  state: 'unresolved' | 'resolved' | 'ignored' | 'archived';
  affected_url: string | null;
  tenant_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  total_event_count: number;
  affected_user_count: number;
  stack_summary: string | null;
  breadcrumb_summary: Array<{ category?: string; message: string; timestamp?: string }> | null;
  tags: Record<string, string>;
  correlated_deploy_id: string | null;
  correlation_ids: string[];
  related_runbook_keys: string[];
  related_topology_keys: string[];
  severity_policy_match: string | null;
}

export interface SentryIssueDetail extends SentryIssue {
  correlated_deploy: {
    id: string;
    short_sha: string;
    status: string;
    deployed_at: string;
    deploy_run_url: string;
  } | null;
  error_logs: Array<{
    id: string;
    fingerprint: string;
    level: string;
    message_redacted: string;
    last_seen_at: string;
  }>;
  events_summary: Array<{
    id: string;
    hour_bucket: string;
    event_count: number;
  }>;
}

export interface SentryWebhookAuditRow {
  id: string;
  received_at: string;
  payload_sha256: string;
  payload_kind: string;
  signature_valid: boolean;
  replay_detected: boolean;
  sentry_issue_id: string | null;
  source_ip_hash: string | null;
  processed_at: string | null;
  error_message: string | null;
}

export interface AgentHandoff {
  id: string;
  title: string;
  prompt_markdown: string;
  created_at: string;
}
