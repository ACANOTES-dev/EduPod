import type { AlertConditionConfig, AlertMetric, PlatformAlertRule } from './alert-rule-list';

const OPERATOR_LABELS: Record<AlertConditionConfig['operator'], string> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const METRIC_LABELS: Record<AlertMetric, string> = {
  api_latency_p95: 'API latency p95',
  bullmq_stuck_jobs: 'BullMQ stuck jobs',
  component_latency: 'Component latency',
  component_status: 'Component status',
  disk_free_gb: 'Disk free GB',
  disk_usage_percent: 'Disk usage',
  error_rate_5m: 'Error rate',
  health_status: 'Health status',
  queue_depth: 'Queue depth',
  queue_failure_rate: 'Queue failure rate',
  stuck_jobs: 'Stuck jobs',
};

function formatThreshold(metric: AlertMetric, config: AlertConditionConfig): string {
  if (metric === 'health_status') {
    if (config.threshold === 0) return 'up';
    if (config.threshold === 1) return 'degraded';
    if (config.threshold === 2) return 'down';
  }

  if (metric === 'disk_usage_percent' || metric === 'queue_failure_rate') {
    return `${config.threshold}%`;
  }

  if (metric === 'api_latency_p95' || metric === 'component_latency') {
    return `${config.threshold} ms`;
  }

  return String(config.threshold);
}

export function describeAlertCondition(rule: PlatformAlertRule): string {
  const config = rule.condition_config;
  const metric = METRIC_LABELS[rule.metric];
  const operator = OPERATOR_LABELS[config.operator];
  const threshold = formatThreshold(rule.metric, config);
  const scope = config.queue
    ? ` on ${config.queue}`
    : config.component
      ? ` for ${config.component}`
      : config.tenant_id
        ? ` for tenant ${config.tenant_id}`
        : '';
  const duration = config.duration_minutes ? ` for ${config.duration_minutes} min` : '';

  return `${metric} ${operator} ${threshold}${scope}${duration}`;
}

export function ConditionDisplay({ rule }: { rule: PlatformAlertRule }) {
  return <>{describeAlertCondition(rule)}</>;
}
