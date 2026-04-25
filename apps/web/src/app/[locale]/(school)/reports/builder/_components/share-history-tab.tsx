'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ReportShareHistoryEntry,
  ReportShareHistoryResponse,
} from '@school/shared/reports';
import { Badge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * Share history tab (impl 19) — visible on a saved report that the current
 * user owns. Lists every prior share fanout from
 * `GET /v1/reports/builder/:id/shares`. Each row links into the resulting
 * inbox conversation, and shows recipient count + format + sharer name.
 */
interface ShareHistoryTabProps {
  reportId: string;
  /** Bumping this number triggers a refetch — used by the parent page after
   *  a successful share so the new entry shows up immediately. */
  refreshKey: number;
}

export function ShareHistoryTab({ reportId, refreshKey }: ShareHistoryTabProps) {
  const t = useTranslations('reports.builder.shareHistory');
  const [entries, setEntries] = React.useState<ReportShareHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient<ReportShareHistoryResponse>(
      `/api/v1/reports/builder/${reportId}/shares?page=1&pageSize=50`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setEntries(res.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiErr = err as { code?: string; message?: string };
        console.error('[ShareHistoryTab.load]', err);
        setError(apiErr?.message ?? t('errorGeneric'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-sm font-medium text-text-primary">{t('emptyTitle')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
      <p className="text-xs text-text-tertiary">{t('description')}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start">
              <th className="px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t('columns.date')}
              </th>
              <th className="px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t('columns.sharedBy')}
              </th>
              <th className="px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t('columns.format')}
              </th>
              <th className="px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t('columns.recipients')}
              </th>
              <th className="px-3 py-2 text-end text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {t('columns.conversation')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((row) => (
              <tr key={row.id} className="hover:bg-surface-secondary">
                <td className="px-3 py-2 text-text-primary">
                  {formatDate(row.shared_at)}
                </td>
                <td className="px-3 py-2 text-text-secondary">{row.shared_by_name}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {row.format}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-text-secondary">{row.recipients_count}</td>
                <td className="px-3 py-2 text-end">
                  {row.conversation_id ? (
                    <Link
                      href={`/inbox/${row.conversation_id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {t('openConversation')}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
