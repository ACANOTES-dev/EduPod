'use client';

import {
  Badge,
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableWrapper,
  toast,
} from '@school/ui';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingSession {
  id: string;
  date: string;
  class_name: string;
  teacher_name: string;
}

interface ExcessiveAbsence {
  student_id: string;
  student_name: string;
  class_name: string;
  absence_count: number;
  threshold: number;
}

interface ExceptionsResponse {
  pending_sessions: PendingSession[];
  excessive_absences: ExcessiveAbsence[];
}

interface PatternAlert {
  id: string;
  student_id: string;
  student_name: string;
  student_number: string | null;
  alert_type: 'excessive_absences' | 'recurring_day' | 'chronic_tardiness';
  details_json: Record<string, unknown>;
  status: 'active' | 'acknowledged' | 'resolved';
  parent_notified: boolean;
  detected_at: string;
}

interface PatternAlertsResponse {
  data: PatternAlert[];
  meta: { page: number; pageSize: number; total: number };
}

type TabValue = 'pending' | 'patterns';
type AlertStatusFilter = 'all' | 'active' | 'acknowledged' | 'resolved';
type AlertTypeFilter = 'all' | 'excessive_absences' | 'recurring_day' | 'chronic_tardiness';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAlertDetails(
  alertType: string,
  details: Record<string, unknown>,
): string {
  const count = String(details.count ?? 0);
  const windowDays = String(details.window_days ?? 0);
  const threshold = String(details.threshold ?? 0);

  switch (alertType) {
    case 'excessive_absences':
      return `${count} absences in ${windowDays} days (threshold: ${threshold})`;
    case 'recurring_day':
      return `Absent on ${String(details.day_name ?? '')}s ${count} times in ${windowDays} days`;
    case 'chronic_tardiness':
      return `Late ${count} times in ${windowDays} days (threshold: ${threshold})`;
    default:
      return '';
  }
}

function AlertTypeBadge({ type, t }: { type: string; t: (key: string) => string }) {
  switch (type) {
    case 'excessive_absences':
      return <Badge variant="danger">{t('excessiveAbsences')}</Badge>;
    case 'recurring_day':
      return <Badge variant="warning">{t('recurringDay')}</Badge>;
    case 'chronic_tardiness':
      return <Badge variant="secondary">{t('chronicTardiness')}</Badge>;
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

function AlertStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge variant="danger">Active</Badge>;
    case 'acknowledged':
      return <Badge variant="info">Acknowledged</Badge>;
    case 'resolved':
      return <Badge variant="success">Resolved</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExceptionsPage() {
  const t = useTranslations('attendance');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // Tab state
  const [activeTab, setActiveTab] = React.useState<TabValue>('pending');

  // Pending tab state
  const [pendingSessions, setPendingSessions] = React.useState<PendingSession[]>([]);
  const [excessiveAbsences, setExcessiveAbsences] = React.useState<ExcessiveAbsence[]>([]);
  const [pendingLoading, setPendingLoading] = React.useState(true);

  // Pattern alerts state
  const [alerts, setAlerts] = React.useState<PatternAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = React.useState(false);
  const [alertsPage, setAlertsPage] = React.useState(1);
  const [alertsTotal, setAlertsTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<AlertStatusFilter>('all');
  const [typeFilter, setTypeFilter] = React.useState<AlertTypeFilter>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const alertsPageSize = 20;

  // Fetch pending sessions & excessive absences
  React.useEffect(() => {
    apiClient<ExceptionsResponse>('/api/v1/attendance/exceptions')
      .then((res) => {
        setPendingSessions(res.pending_sessions ?? []);
        setExcessiveAbsences(res.excessive_absences ?? []);
      })
      .catch(() => undefined)
      .finally(() => setPendingLoading(false));
  }, []);

  // Fetch pattern alerts
  const fetchAlerts = React.useCallback(async () => {
    setAlertsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(alertsPage),
        pageSize: String(alertsPageSize),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('alert_type', typeFilter);

      const res = await apiClient<PatternAlertsResponse>(
        `/api/v1/attendance/pattern-alerts?${params.toString()}`,
      );
      setAlerts(res.data);
      setAlertsTotal(res.meta.total);
    } catch {
      setAlerts([]);
      setAlertsTotal(0);
    } finally {
      setAlertsLoading(false);
    }
  }, [alertsPage, statusFilter, typeFilter]);

  React.useEffect(() => {
    if (activeTab === 'patterns') {
      void fetchAlerts();
    }
  }, [activeTab, fetchAlerts]);

  // Reset page when filters change
  React.useEffect(() => {
    setAlertsPage(1);
  }, [statusFilter, typeFilter]);

  // Actions
  const handleAcknowledge = async (id: string) => {
    setActionLoading(`ack:${id}`);
    try {
      await apiClient(`/api/v1/attendance/pattern-alerts/${id}/acknowledge`, {
        method: 'PATCH',
        silent: true,
      });
      toast.success(t('acknowledge') + ' - OK');
      void fetchAlerts();
    } catch {
      toast.error(t('acknowledge') + ' - Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActionLoading(`resolve:${id}`);
    try {
      await apiClient(`/api/v1/attendance/pattern-alerts/${id}/resolve`, {
        method: 'PATCH',
        silent: true,
      });
      toast.success(t('resolve') + ' - OK');
      void fetchAlerts();
    } catch {
      toast.error(t('resolve') + ' - Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleNotifyParent = async (id: string) => {
    setActionLoading(`notify:${id}`);
    try {
      await apiClient(`/api/v1/attendance/pattern-alerts/${id}/notify-parent`, {
        method: 'POST',
        silent: true,
      });
      toast.success(t('notifyParent') + ' - OK');
      void fetchAlerts();
    } catch {
      toast.error(t('notifyParent') + ' - Failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(alertsTotal / alertsPageSize));
  const startItem = alertsTotal === 0 ? 0 : (alertsPage - 1) * alertsPageSize + 1;
  const endItem = Math.min(alertsPage * alertsPageSize, alertsTotal);

  // ─── Tab bar ──────────────────────────────────────────────────────────────
  const tabs: { key: TabValue; label: string }[] = [
    { key: 'pending', label: t('pendingTab') },
    { key: 'patterns', label: t('patternsTab') },
  ];

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  if (pendingLoading && activeTab === 'pending') {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  // ─── Pending Tab Content ──────────────────────────────────────────────────
  const pendingContent = (
    <>
      {/* Pending Sessions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-text-primary">{t('pendingSessions')}</h2>
          {pendingSessions.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {pendingSessions.length}
            </span>
          )}
        </div>

        {pendingSessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-text-tertiary">No pending sessions</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:bg-surface-secondary transition-colors cursor-pointer"
                onClick={() => router.push(`/${locale}/attendance/mark/${session.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{session.class_name}</p>
                    <p className="text-xs text-text-secondary">{session.teacher_name}</p>
                  </div>
                  <AttendanceStatusBadge status="open" type="session" />
                </div>
                <p className="mt-2 text-xs font-mono text-text-tertiary">{session.date}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Excessive Absences */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-text-primary">{t('excessiveAbsences')}</h2>
          {excessiveAbsences.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {excessiveAbsences.length}
            </span>
          )}
        </div>

        {excessiveAbsences.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-text-tertiary">No excessive absences detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Student
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Class
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Absences
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Threshold
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {excessiveAbsences.map((row) => (
                  <tr
                    key={`${row.student_id}-${row.class_name}`}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.student_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.class_name}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-600">{row.absence_count}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.threshold}</td>
                    <td className="px-4 py-3">
                      <AttendanceStatusBadge status="absent" type="daily" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  // ─── Patterns Tab Content ─────────────────────────────────────────────────

  const filtersToolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-44">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatusFilter)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filterAll')}</SelectItem>
            <SelectItem value="active">{t('filterActive')}</SelectItem>
            <SelectItem value="acknowledged">{t('filterAcknowledged')}</SelectItem>
            <SelectItem value="resolved">{t('filterResolved')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-52">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AlertTypeFilter)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filterAllTypes')}</SelectItem>
            <SelectItem value="excessive_absences">{t('excessiveAbsences')}</SelectItem>
            <SelectItem value="recurring_day">{t('recurringDay')}</SelectItem>
            <SelectItem value="chronic_tardiness">{t('chronicTardiness')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const alertsPagination = (
    <div className="flex items-center justify-between text-sm text-text-secondary">
      <span>
        {alertsTotal === 0 ? t('noPatterns') : `${startItem}\u2013${endItem} / ${alertsTotal}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={alertsPage <= 1}
          onClick={() => setAlertsPage(alertsPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="px-2 text-sm text-text-primary">
          {alertsPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={alertsPage >= totalPages}
          onClick={() => setAlertsPage(alertsPage + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );

  const patternsContent = (
    <>
      {!alertsLoading && alerts.length === 0 && statusFilter === 'all' && typeFilter === 'all' ? (
        <EmptyState
          icon={TrendingUp}
          title={t('noPatterns')}
          description={t('noPatternsDescription')}
        />
      ) : (
        <TableWrapper toolbar={filtersToolbar} pagination={alertsPagination}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('student')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('alertType')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('details')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('detectedDate')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('statusLabel')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {alertsLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                      {[1, 2, 3, 4, 5, 6].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                        </td>
                      ))}
                    </tr>
                  ))
                : alerts.length === 0
                  ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-tertiary">
                          {t('noPatterns')}
                        </td>
                      </tr>
                    )
                  : alerts.map((alert) => (
                      <tr
                        key={alert.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {alert.student_name}
                            </p>
                            {alert.student_number && (
                              <p className="text-xs font-mono text-text-tertiary" dir="ltr">
                                {alert.student_number}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <AlertTypeBadge type={alert.alert_type} t={t} />
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {formatAlertDetails(alert.alert_type, alert.details_json)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {alert.detected_at
                            ? new Date(alert.detected_at).toLocaleDateString()
                            : '\u2014'}
                        </td>
                        <td className="px-4 py-3">
                          <AlertStatusBadge status={alert.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {alert.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading !== null}
                                onClick={() => void handleAcknowledge(alert.id)}
                              >
                                {actionLoading === `ack:${alert.id}` ? (
                                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Eye className="me-1 h-3.5 w-3.5" />
                                )}
                                {t('acknowledge')}
                              </Button>
                            )}
                            {(alert.status === 'active' || alert.status === 'acknowledged') && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionLoading !== null}
                                onClick={() => void handleResolve(alert.id)}
                              >
                                {actionLoading === `resolve:${alert.id}` ? (
                                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="me-1 h-3.5 w-3.5" />
                                )}
                                {t('resolve')}
                              </Button>
                            )}
                            {!alert.parent_notified && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={actionLoading !== null}
                                onClick={() => void handleNotifyParent(alert.id)}
                              >
                                {actionLoading === `notify:${alert.id}` ? (
                                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Bell className="me-1 h-3.5 w-3.5" />
                                )}
                                {t('notifyParent')}
                              </Button>
                            )}
                            {alert.parent_notified && (
                              <span className="inline-flex items-center text-xs text-success-text">
                                <CheckCircle className="me-1 h-3.5 w-3.5" />
                                {t('parentNotified')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('exceptions')} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-primary-700 text-primary-700'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'pending' && <div className="space-y-6">{pendingContent}</div>}
      {activeTab === 'patterns' && <div className="space-y-6">{patternsContent}</div>}
    </div>
  );
}
