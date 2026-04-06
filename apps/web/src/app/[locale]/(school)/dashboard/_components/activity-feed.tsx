'use client';
import { Activity } from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type: string;
  actor_name?: string;
  created_at: string;
}

export interface ActivityFeedProps {
  /** Audit log entries for today. */
  activities?: AuditLogItem[];
  /** Whether data is still loading. */
  loading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO datetime string to a relative time like "12m ago". */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

/** Format an action string from snake_case to readable text. */
function formatAction(action: string, entityType: string): string {
  // "create_student" -> "Created student"
  const readable = action.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase());
  if (entityType && !action.toLowerCase().includes(entityType.toLowerCase())) {
    const readableEntity = entityType.replace(/_/g, ' ');
    return `${readable} (${readableEntity})`;
  }
  return readable;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFeed({ activities = [], loading = false }: ActivityFeedProps) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-text-primary">Today&apos;s Activity</h3>
        <Link
          href="/settings/audit-log"
          className="text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          View all log &rarr;
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-[13px] text-text-tertiary">
            Loading activity...
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-tertiary">
            <Activity className="h-5 w-5" />
            <span className="text-[13px]">No activity recorded today</span>
          </div>
        ) : (
          activities.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-secondary transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-secondary">
                <Activity className="h-4 w-4 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-text-primary truncate">
                  {formatAction(item.action, item.entity_type)}
                </p>
                <p className="text-[12px] text-text-tertiary truncate">
                  {item.actor_name ?? 'System'}
                </p>
              </div>
              <span className="shrink-0 text-[12px] text-text-tertiary">
                {formatRelativeTime(item.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
