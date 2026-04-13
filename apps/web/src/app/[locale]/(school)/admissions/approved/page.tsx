'use client';

import { CheckCircle2, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Input } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CapacityChip } from '../_components/capacity-chip';
import { QueueHeader } from '../_components/queue-header';
import type { ApprovedRow, YearGroupBucket } from '../_components/queue-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovedResponse {
  data: YearGroupBucket<ApprovedRow>[];
  meta: { total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovedQueuePage() {
  const t = useTranslations('admissionsQueues');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [buckets, setBuckets] = React.useState<YearGroupBucket<ApprovedRow>[]>([]);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const fetchApproved = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      const qs = params.toString();
      const res = await apiClient<ApprovedResponse>(
        `/api/v1/applications/queues/approved${qs ? `?${qs}` : ''}`,
      );
      setBuckets(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[ApprovedQueuePage]', err);
      setBuckets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  React.useEffect(() => {
    void fetchApproved();
  }, [fetchApproved]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(search.trim());
  };

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('approved.title')}
        description={t('approved.description')}
        count={total}
        countLabel={t('approved.countLabel')}
        badges={buckets.map((bucket) => (
          <CapacityChip
            key={`${bucket.target_academic_year_id}:${bucket.year_group_id}`}
            capacity={bucket.capacity}
            yearGroupName={bucket.year_group_name}
          />
        ))}
      />

      <form onSubmit={handleSearch} className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('approved.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </form>

      {loading ? (
        <div className="text-sm text-text-secondary">{t('common.loading')}</div>
      ) : buckets.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t('approved.emptyTitle')}
          description={t('approved.emptyDescription')}
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
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('approved.col.studentNumber')}</th>
                      <th className="px-3 py-2 text-start">{t('approved.col.student')}</th>
                      <th className="px-3 py-2 text-start">{t('approved.col.household')}</th>
                      <th className="px-3 py-2 text-start">{t('approved.col.class')}</th>
                      <th className="px-3 py-2 text-start">{t('approved.col.admittedBy')}</th>
                      <th className="px-3 py-2 text-start">{t('approved.col.admittedOn')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bucket.applications.map((row) => {
                      const reviewer = row.reviewed_by
                        ? `${row.reviewed_by.first_name} ${row.reviewed_by.last_name}`
                        : '\u2014';
                      return (
                        <tr key={row.id}>
                          <td className="px-3 py-3 font-mono text-xs text-text-secondary">
                            {row.student_number ?? '\u2014'}
                          </td>
                          <td className="px-3 py-3">
                            {row.student_id ? (
                              <Link
                                href={`/${locale}/students/${row.student_id}`}
                                className="font-medium text-text-primary hover:text-primary-600"
                              >
                                {row.student_first_name} {row.student_last_name}
                              </Link>
                            ) : (
                              <span className="font-medium text-text-primary">
                                {row.student_first_name} {row.student_last_name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">
                            {row.household_id ? (
                              <Link
                                href={`/${locale}/households/${row.household_id}`}
                                className="hover:text-primary-600"
                              >
                                <span className="font-mono text-xs">{row.household_number}</span>
                                {row.household_name ? (
                                  <span className="ms-1.5 text-text-tertiary">
                                    {row.household_name}
                                  </span>
                                ) : null}
                              </Link>
                            ) : (
                              '\u2014'
                            )}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">
                            {row.class_name ?? t('approved.unassigned')}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">{reviewer}</td>
                          <td className="px-3 py-3 text-text-secondary">
                            {formatDate(row.reviewed_at)}
                          </td>
                          <td className="px-3 py-3 text-end">
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/${locale}/admissions/${row.id}`}>
                                {t('common.view')}
                              </Link>
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
