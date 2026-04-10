'use client';

import { Archive, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Input, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { QueueHeader } from '../_components/queue-header';
import type { RejectedRow } from '../_components/queue-types';

interface RejectedResponse {
  data: RejectedRow[];
  meta: { page: number; pageSize: number; total: number };
}

export default function RejectedArchivePage() {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [rows, setRows] = React.useState<RejectedRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [search, setSearch] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const fetchArchive = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchTerm) params.set('search', searchTerm);
      const res = await apiClient<RejectedResponse>(
        `/api/v1/applications/queues/rejected?${params.toString()}`,
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[RejectedArchivePage]', err);
      toast.error(t('errors.loadFailed'));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, t]);

  React.useEffect(() => {
    void fetchArchive();
  }, [fetchArchive]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchTerm(search.trim());
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('rejected.title')}
        description={t('rejected.description')}
        count={total}
        countLabel={t('rejected.countLabel')}
      />

      <form onSubmit={handleSearch} className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('rejected.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </form>

      {loading ? (
        <div className="text-sm text-text-secondary">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={t('rejected.emptyTitle')}
          description={t('rejected.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
              <tr>
                <th className="px-3 py-2 text-start">{t('rejected.col.applicationNumber')}</th>
                <th className="px-3 py-2 text-start">{t('rejected.col.student')}</th>
                <th className="px-3 py-2 text-start">{t('rejected.col.parent')}</th>
                <th className="px-3 py-2 text-start">{t('rejected.col.reason')}</th>
                <th className="px-3 py-2 text-start">{t('rejected.col.rejectedBy')}</th>
                <th className="px-3 py-2 text-start">{t('rejected.col.rejectedOn')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const parent = row.parent;
                const parentName = [parent.first_name, parent.last_name].filter(Boolean).join(' ');
                const reviewer = row.reviewed_by
                  ? `${row.reviewed_by.first_name} ${row.reviewed_by.last_name}`
                  : '—';
                const truncatedReason =
                  row.rejection_reason && row.rejection_reason.length > 80
                    ? `${row.rejection_reason.slice(0, 77)}…`
                    : (row.rejection_reason ?? '—');
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                      {row.application_number}
                    </td>
                    <td className="px-3 py-3 font-medium text-text-primary">
                      {row.student_first_name} {row.student_last_name}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{parentName || '—'}</td>
                    <td
                      className="px-3 py-3 text-text-secondary"
                      title={row.rejection_reason ?? ''}
                    >
                      {truncatedReason}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{reviewer}</td>
                    <td className="px-3 py-3 text-text-secondary">{formatDate(row.reviewed_at)}</td>
                    <td className="px-3 py-3 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/${locale}/admissions/${row.id}`)}
                      >
                        {t('common.view')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-text-secondary">
            {t('common.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
