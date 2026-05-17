import type { SentryIssueState } from '@prisma/client';

export type SentryWebhookKind = 'event_alert' | 'issue_alert' | 'issue_resolved' | 'metric_alert';

export interface NormalizedSentryIssue {
  affected_url?: string;
  affected_user_count: number;
  breadcrumb_summary?: Array<{ category?: string; message: string; timestamp?: string }>;
  component?: string;
  correlation_ids: string[];
  culprit?: string;
  environment?: string;
  event_id?: string;
  fingerprint: string[];
  first_seen_at: Date;
  kind: SentryWebhookKind;
  last_seen_at: Date;
  level?: string;
  organization: string;
  permalink: string;
  project: string;
  release?: string;
  sentry_issue_id: string;
  stack_summary?: string;
  state: SentryIssueState;
  tags: Record<string, string>;
  tenant_id?: string;
  title: string;
  total_event_count: number;
}

export interface SentryCorrelationResult {
  correlated_deploy_id?: string;
  correlation_ids: string[];
  related_runbook_keys: string[];
  related_topology_keys: string[];
  severity_policy_match?: string;
}
