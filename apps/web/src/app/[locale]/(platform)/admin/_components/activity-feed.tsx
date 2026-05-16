'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Radio,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

type ActivityKind = 'alert' | 'audit' | 'onboarding' | 'queue';
type AlertSeverity = 'info' | 'warning' | 'critical';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  occurredAt: string;
}

interface PlatformAlertHistory {
  id: string;
  severity: AlertSeverity;
  message: string;
  status: 'fired' | 'acknowledged' | 'resolved';
  fired_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  rule?: { name: string };
}

interface AlertHistoryResponse {
  data: PlatformAlertHistory[];
  meta: { page: number; pageSize: number; total: number };
}

interface PlatformAuditActor {
  email: string;
  first_name: string;
  last_name: string;
}

interface PlatformAuditLog {
  id: string;
  action: string;
  target_resource_type: string;
  target_resource_id: string | null;
  target_tenant_id: string | null;
  reason: string | null;
  created_at: string;
  actor?: PlatformAuditActor;
}

interface PlatformAuditResponse {
  data: PlatformAuditLog[];
  meta: { page: number; pageSize: number; total: number };
}

interface AlertFiredEvent {
  type: 'alert_fired';
  alert_id: string;
  rule_name: string;
  message: string;
  fired_at: string;
}

interface AlertResolvedEvent {
  type: 'alert_resolved';
  alert_id: string;
  resolved_at: string;
}

interface OnboardingSocketPayload {
  tenant_id?: string;
  step_key?: string;
  status?: string;
}

interface QueueMetricPayload {
  type?: string;
  queues?: Array<{ name: string; failed: number; waiting: number; active: number }>;
}

interface ActivityFeedProps {
  className?: string;
}

function isAlertFiredEvent(value: unknown): value is AlertFiredEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'alert_fired' &&
    typeof record.alert_id === 'string' &&
    typeof record.rule_name === 'string' &&
    typeof record.message === 'string' &&
    typeof record.fired_at === 'string'
  );
}

function isAlertResolvedEvent(value: unknown): value is AlertResolvedEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'alert_resolved' &&
    typeof record.alert_id === 'string' &&
    typeof record.resolved_at === 'string'
  );
}

function isOnboardingPayload(value: unknown): value is OnboardingSocketPayload {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && 'tenant_id' in value
  );
}

function isQueueMetricPayload(value: unknown): value is QueueMetricPayload {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function alertToActivity(alert: PlatformAlertHistory): ActivityItem {
  const occurredAt = alert.resolved_at ?? alert.acknowledged_at ?? alert.fired_at;
  return {
    id: `alert-${alert.id}-${occurredAt}`,
    kind: 'alert',
    title:
      alert.status === 'resolved'
        ? 'Alert resolved'
        : alert.status === 'acknowledged'
          ? 'Alert acknowledged'
          : `${alert.severity} alert fired`,
    description: alert.rule?.name ? `${alert.rule.name}: ${alert.message}` : alert.message,
    occurredAt,
  };
}

function auditToActivity(row: PlatformAuditLog): ActivityItem {
  const actorName = row.actor
    ? `${row.actor.first_name} ${row.actor.last_name}`.trim() || row.actor.email
    : 'Platform operator';
  return {
    id: `audit-${row.id}`,
    kind: 'audit',
    title: row.action.replaceAll('_', ' '),
    description: `${actorName} changed ${row.target_resource_type}${
      row.reason ? ` · ${row.reason}` : ''
    }`,
    occurredAt: row.created_at,
  };
}

function formatRelativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return 'Just now';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  return `${Math.floor(elapsedHours / 24)} d ago`;
}

function sortActivity(items: ActivityItem[]): ActivityItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return [...byId.values()]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 10);
}

function iconForKind(kind: ActivityKind) {
  if (kind === 'alert') return AlertTriangle;
  if (kind === 'audit') return ClipboardList;
  if (kind === 'onboarding') return GitBranch;
  return Workflow;
}

export function ActivityFeed({ className }: ActivityFeedProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { connected, subscribe } = usePlatformSocket();
  const [items, setItems] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [degraded, setDegraded] = React.useState(false);

  const loadActivity = React.useCallback(async () => {
    try {
      setDegraded(false);
      const alertsPromise = apiClient<AlertHistoryResponse>(
        '/api/v1/admin/alerts/history?pageSize=10',
        { silent: true },
      );
      const auditPromise = apiClient<PlatformAuditResponse>(
        '/api/v1/admin/platform-audit-logs?pageSize=10',
        { silent: true },
      );
      const [alertsResult, auditResult] = await Promise.allSettled([alertsPromise, auditPromise]);
      const nextItems: ActivityItem[] = [];

      if (alertsResult.status === 'fulfilled') {
        nextItems.push(...alertsResult.value.data.map(alertToActivity));
      } else {
        console.error('[ActivityFeed.loadActivity.alerts]', alertsResult.reason);
        setDegraded(true);
      }

      if (auditResult.status === 'fulfilled') {
        nextItems.push(...auditResult.value.data.map(auditToActivity));
      } else {
        console.error('[ActivityFeed.loadActivity.audit]', auditResult.reason);
        setDegraded(true);
      }

      setItems(sortActivity(nextItems));
    } catch (err: unknown) {
      console.error('[ActivityFeed.loadActivity]', err);
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  React.useEffect(() => {
    const unsubscribeAlerts = subscribe('alert:new', (payload) => {
      if (isAlertFiredEvent(payload)) {
        setItems((current) =>
          sortActivity([
            {
              id: `alert-${payload.alert_id}-${payload.fired_at}`,
              kind: 'alert',
              title: 'Alert fired',
              description: `${payload.rule_name}: ${payload.message}`,
              occurredAt: payload.fired_at,
            },
            ...current,
          ]),
        );
        return;
      }

      if (isAlertResolvedEvent(payload)) {
        setItems((current) =>
          sortActivity([
            {
              id: `alert-${payload.alert_id}-${payload.resolved_at}`,
              kind: 'alert',
              title: 'Alert resolved',
              description: 'A platform alert moved out of the active queue.',
              occurredAt: payload.resolved_at,
            },
            ...current,
          ]),
        );
      }
    });

    const unsubscribeOnboarding = subscribe('onboarding:update', (payload) => {
      if (isOnboardingPayload(payload)) {
        const occurredAt = new Date().toISOString();
        setItems((current) =>
          sortActivity([
            {
              id: `onboarding-${payload.tenant_id ?? 'unknown'}-${occurredAt}`,
              kind: 'onboarding',
              title: 'Onboarding updated',
              description: payload.step_key
                ? `${payload.step_key.replaceAll('_', ' ')} moved to ${payload.status ?? 'updated'}`
                : 'A tenant onboarding tracker changed.',
              occurredAt,
            },
            ...current,
          ]),
        );
      }
    });

    const unsubscribeQueues = subscribe('queue_metrics', (payload) => {
      if (!isQueueMetricPayload(payload) || payload.type !== 'queue_metrics') return;
      const queues = payload.queues ?? [];
      const failedTotal = queues.reduce((total, queue) => total + queue.failed, 0);
      if (failedTotal === 0) return;
      const occurredAt = new Date().toISOString();
      setItems((current) =>
        sortActivity([
          {
            id: `queue-${occurredAt}`,
            kind: 'queue',
            title: 'Queue failures detected',
            description: `${failedTotal} failed job${failedTotal === 1 ? '' : 's'} across background queues.`,
            occurredAt,
          },
          ...current,
        ]),
      );
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeOnboarding();
      unsubscribeQueues();
    };
  }, [subscribe]);

  React.useEffect(() => {
    if (connected) return undefined;
    const interval = setInterval(() => void loadActivity(), 30_000);
    return () => clearInterval(interval);
  }, [connected, loadActivity]);

  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-surface shadow-sm xl:min-h-[520px]',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Activity Feed</h2>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {degraded ? 'Some activity sources are unavailable' : 'Recent platform events'}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
          href={`/${locale}/admin/audit-log/platform`}
        >
          View all
        </Link>
      </header>

      <div className="max-h-[520px] overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-fill text-success-text">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text-primary">No recent activity</p>
            <p className="mt-1 text-xs text-text-secondary">
              Alert, audit, onboarding, and queue events will appear here.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ol className="divide-y divide-border">
            {items.map((item) => {
              const Icon = iconForKind(item.kind);
              return (
                <li key={item.id} className="flex min-w-0 gap-3 px-5 py-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize text-text-primary">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                      {item.description}
                    </p>
                    <time
                      className="mt-1 block text-xs text-text-tertiary"
                      dateTime={item.occurredAt}
                    >
                      {formatRelativeTime(item.occurredAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
