'use client';

import { Badge, Button } from '@school/ui';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyReport {
  id: string;
  concern_number: string;
  concern_type: string;
  reported_at: string;
  acknowledgement_status: string | null;
}

interface MyReportsResponse {
  data: MyReport[];
  meta: { page: number; pageSize: number; total: number };
}

const ACK_COLORS: Record<string, string> = {
  received: 'bg-blue-100 text-blue-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  under_review: 'bg-amber-100 text-amber-800',
};

const ACK_KEYS: Record<string, string> = {
  received: 'received',
  assigned: 'assigned',
  under_review: 'underReview',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyReportsPage() {
  const t = useTranslations('safeguarding.myReports');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [reports, setReports] = React.useState<MyReport[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    setIsLoading(true);
    apiClient<MyReportsResponse>(`/api/v1/safeguarding/my-reports?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((res) => {
        setReports(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch(() => {
        setReports([]);
        setTotal(0);
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/safeguarding/concerns/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('reportConcern')}
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <FileText className="h-12 w-12 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">
            {t('noReports')}
          </p>
          <Link href={`/${locale}/safeguarding/concerns/new`}>
            <Button variant="outline">{t('reportConcern')}</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('columns.concernNumber')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('columns.type')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('columns.reported')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('columns.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-border">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-text-primary">
                      {report.concern_number}
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">
                      {report.concern_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-tertiary">
                      {formatDate(report.reported_at)}
                    </td>
                    <td className="px-4 py-3">
                      {report.acknowledgement_status ? (
                        <Badge className={ACK_COLORS[report.acknowledgement_status] ?? 'bg-gray-100 text-gray-800'}>
                          {t(`ackStatuses.${ACK_KEYS[report.acknowledgement_status] ?? report.acknowledgement_status}` as Parameters<typeof t>[0])}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600">{t('ackStatuses.pending')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {reports.map((report) => (
              <div
                key={report.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {report.concern_number}
                  </span>
                  {report.acknowledgement_status ? (
                    <Badge className={ACK_COLORS[report.acknowledgement_status] ?? 'bg-gray-100 text-gray-800'}>
                      {ACK_LABELS[report.acknowledgement_status] ?? report.acknowledgement_status}
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600">Pending</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm capitalize text-text-secondary">
                  {report.concern_type.replace(/_/g, ' ')}
                </p>
                <p className="mt-0.5 text-[11px] text-text-tertiary">
                  {t('reported')}: {formatDate(report.reported_at)}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm text-text-secondary">
              <span>{t('pagination', { page, totalPages })}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
