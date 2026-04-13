'use client';

import { Archive, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Input, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CapacityChip } from '../_components/capacity-chip';
import { QueueHeader } from '../_components/queue-header';
import type { RejectedRow, YearGroupBucket } from '../_components/queue-types';

interface RejectedResponse {
  data: YearGroupBucket<RejectedRow>[];
  meta: { total: number };
}

export default function RejectedArchivePage() {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [buckets, setBuckets] = React.useState<YearGroupBucket<RejectedRow>[]>([]);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const fetchArchive = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      const qs = params.toString();
      const res = await apiClient<RejectedResponse>(
        `/api/v1/applications/queues/rejected${qs ? `?${qs}` : ''}`,
      );
      setBuckets(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[RejectedArchivePage]', err);
      toast.error(t('errors.loadFailed'));
      setBuckets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, t]);

  React.useEffect(() => {
    void fetchArchive();
  }, [fetchArchive]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(search.trim());
  };

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
      ) : buckets.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={t('rejected.emptyTitle')}
          description={t('rejected.emptyDescription')}
        />
      ) : (
        <div className="space-y-6">
          {buckets.map((bucket) => (
            <section
              key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
              className="space-y-3"
            >
              <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-background py-2">
                <h2 className="text-lg font-semibold text-text-primary">
                  {bucket.year_group_name}
                </h2>
                <span className="text-xs text-text-secondary">
                  {bucket.target_academic_year_name}
                </span>
                <CapacityChip capacity={bucket.capacity} yearGroupName={bucket.year_group_name} />
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-start">
                        {t('rejected.col.applicationNumber')}
                      </th>
                      <th className="px-3 py-2 text-start">{t('rejected.col.student')}</th>
                      <th className="px-3 py-2 text-start">{t('rejected.col.parent')}</th>
                      <th className="px-3 py-2 text-start">{t('rejected.col.reason')}</th>
                      <th className="px-3 py-2 text-start">{t('rejected.col.rejectedBy')}</th>
                      <th className="px-3 py-2 text-start">{t('rejected.col.rejectedOn')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bucket.applications.map((row) => {
                      const parent = row.parent;
                      const parentName = [parent.first_name, parent.last_name]
                        .filter(Boolean)
                        .join(' ');
                      const reviewer = row.reviewed_by
                        ? `${row.reviewed_by.first_name} ${row.reviewed_by.last_name}`
                        : '\u2014';
                      const truncatedReason =
                        row.rejection_reason && row.rejection_reason.length > 80
                          ? `${row.rejection_reason.slice(0, 77)}\u2026`
                          : (row.rejection_reason ?? '\u2014');
                      return (
                        <tr key={row.id}>
                          <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                            {row.application_number}
                          </td>
                          <td className="px-3 py-3 font-medium text-text-primary">
                            {row.student_first_name} {row.student_last_name}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">
                            {parentName || '\u2014'}
                          </td>
                          <td
                            className="px-3 py-3 text-text-secondary"
                            title={row.rejection_reason ?? ''}
                          >
                            {truncatedReason}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">{reviewer}</td>
                          <td className="px-3 py-3 text-text-secondary">
                            {formatDate(row.reviewed_at)}
                          </td>
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
