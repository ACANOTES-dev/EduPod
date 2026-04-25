'use client';

import { Calendar, Clock, History, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Switch,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { humanizeCron } from './_components/cron-helpers';
import { RunHistoryDrawer } from './_components/run-history-drawer';
import { ScheduledReportForm } from './_components/scheduled-report-form';

/**
 * Scheduled Reports list page (impl 17).
 *
 * The hub for tenant admins to manage scheduled report deliveries.
 * Lists every scheduled report the user can see, with row actions:
 *   - Toggle Active / Paused (PUT `/v1/reports/scheduled/:id`)
 *   - View Run History (opens the drawer over `GET /:id/runs`)
 *   - Delete (DELETE)
 *   - "+ New scheduled report" opens the create modal
 *
 * Deep-link entry: `?new=true` opens the create modal on mount;
 * `?report_id=<id>` pre-fills the saved-report dropdown so impl 16's
 * builder UI can wire a "Schedule this report" shortcut without coding
 * a separate page.
 *
 * Error state is explicit — no silent mock fallback. If the list fetch
 * fails, the empty state surfaces a "couldn't load" message and a
 * retry button. Per CLAUDE.md "no silent failures".
 */

interface ScheduledReportRow {
  id: string;
  name: string;
  report_type: string;
  parameters_json: { saved_report_id?: string; delivery_formats?: string[] } | null;
  schedule_cron: string;
  recipient_emails: string[] | null;
  format: string;
  active: boolean;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  data: ScheduledReportRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function ScheduledReportsPage() {
  const t = useTranslations('reports.scheduled');
  const searchParams = useSearchParams();
  const deepLinkNew = searchParams?.get('new') === 'true';
  const deepLinkReportId = searchParams?.get('report_id') ?? null;

  const [items, setItems] = React.useState<ScheduledReportRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerSchedule, setDrawerSchedule] = React.useState<ScheduledReportRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  // ─── Open create modal from deep-link query ─────────────────────────────

  React.useEffect(() => {
    if (deepLinkNew) setCreateOpen(true);
  }, [deepLinkNew]);

  // ─── Fetch list ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    apiClient<ListResponse>('/api/v1/reports/scheduled?page=1&pageSize=50', {
      method: 'GET',
      signal: controller.signal,
      silent: true,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.data ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[ScheduledReportsPage]', err);
        setLoadError(t('listLoadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshTick, t]);

  // ─── Row actions ────────────────────────────────────────────────────────

  const toggleActive = async (id: string, nextActive: boolean) => {
    // Optimistic update — flip immediately, revert on failure
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, active: nextActive } : r)));
    try {
      await apiClient(`/api/v1/reports/scheduled/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: nextActive }),
        silent: true,
      });
    } catch (err: unknown) {
      console.error('[ScheduledReportsPage.toggleActive]', err);
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, active: !nextActive } : r)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await apiClient(`/api/v1/reports/scheduled/${id}`, {
        method: 'DELETE',
        silent: true,
      });
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      console.error('[ScheduledReportsPage.delete]', err);
    } finally {
      setPendingDeleteId(null);
    }
  };

  const openHistory = (schedule: ScheduledReportRow) => {
    setDrawerSchedule(schedule);
    setDrawerOpen(true);
  };

  const onSaved = () => setRefreshTick((n) => n + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: '../', label: t('backToReports') }}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createButton')}
          </Button>
        }
      />

      {loadError && !loading && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">{t('listLoadErrorTitle')}</p>
            <p className="mt-1 text-sm text-red-600">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshTick((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 && !loadError ? (
        <EmptyState
          icon={Calendar}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={{
            label: t('createButton'),
            onClick: () => setCreateOpen(true),
          }}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const recipientCount = Array.isArray(row.recipient_emails)
              ? row.recipient_emails.length
              : 0;
            const cadenceLabel = humanizeCron(row.schedule_cron);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
                      <Clock className="h-4 w-4 text-text-tertiary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{row.name}</p>
                      <p className="mt-0.5 text-xs text-text-tertiary">{cadenceLabel}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="uppercase">
                          {row.format}
                        </Badge>
                        <Badge variant="secondary">
                          {t('recipientsCount', { n: recipientCount })}
                        </Badge>
                        {row.last_sent_at && (
                          <Badge variant="secondary">
                            {t('lastSent')} {formatRelative(row.last_sent_at)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-surface-secondary text-text-tertiary'
                      }`}
                    >
                      {row.active ? t('active') : t('inactive')}
                    </span>
                    <Switch
                      aria-label={t('toggleActive', { name: row.name })}
                      checked={row.active}
                      onCheckedChange={(next) => void toggleActive(row.id, next)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openHistory(row)}
                    >
                      <History className="me-2 h-4 w-4" />
                      {t('viewHistory')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendingDeleteId === row.id}
                      onClick={() => void handleDelete(row.id)}
                      aria-label={t('deleteAria', { name: row.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ScheduledReportForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={onSaved}
        prefilledSavedReportId={deepLinkReportId}
      />

      <RunHistoryDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerSchedule(null);
        }}
        scheduleId={drawerSchedule?.id ?? null}
        scheduleName={drawerSchedule?.name ?? ''}
      />
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
