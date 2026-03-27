'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { ConcernCard } from '@/components/behaviour/concern-card';
import { SafeguardingSeverityBadge } from '@/components/behaviour/safeguarding-severity-badge';
import { SafeguardingStatusBadge } from '@/components/behaviour/safeguarding-status-badge';
import { SlaIndicator } from '@/components/behaviour/sla-indicator';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConcernRow {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  sla_status: string;
  reported_at: string;
  student_name: string;
  assigned_to_name: string | null;
}

interface ConcernsResponse {
  data: ConcernRow[];
  meta: { page: number; pageSize: number; total: number };
}

const STATUSES = ['reported', 'acknowledged', 'under_investigation', 'referred', 'monitoring', 'resolved', 'sealed'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SLA_STATUSES = ['overdue', 'due_soon', 'on_track'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConcernListPage() {
  const t = useTranslations('safeguarding.concerns');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<ConcernRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [statusFilters, setStatusFilters] = React.useState<Set<string>>(new Set());
  const [severityFilters, setSeverityFilters] = React.useState<Set<string>>(new Set());
  const [slaFilter, setSlaFilter] = React.useState('all');

  const toggleFilter = (set: Set<string>, value: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setter(next);
    setPage(1);
  };

  const fetchConcerns = React.useCallback(
    async (p: number, statuses: Set<string>, severities: Set<string>, sla: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (statuses.size > 0) params.set('status', Array.from(statuses).join(','));
        if (severities.size > 0) params.set('severity', Array.from(severities).join(','));
        if (sla !== 'all') params.set('sla_status', sla);
        const res = await apiClient<ConcernsResponse>(`/api/v1/safeguarding/concerns?${params.toString()}`);
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchConcerns(page, statusFilters, severityFilters, slaFilter);
  }, [page, statusFilters, severityFilters, slaFilter, fetchConcerns]);

  const columns = [
    {
      key: 'concern_number',
      header: t('columns.concernNumber'),
      render: (row: ConcernRow) => (
        <span className="font-mono text-xs font-medium text-text-primary">{row.concern_number}</span>
      ),
    },
    {
      key: 'student_name',
      header: t('columns.student'),
      render: (row: ConcernRow) => (
        <span className="text-sm font-medium text-text-primary">{row.student_name}</span>
      ),
    },
    {
      key: 'concern_type',
      header: t('columns.type'),
      render: (row: ConcernRow) => (
        <span className="text-sm text-text-secondary">{row.concern_type}</span>
      ),
    },
    {
      key: 'severity',
      header: t('columns.severity'),
      render: (row: ConcernRow) => <SafeguardingSeverityBadge severity={row.severity} />,
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: ConcernRow) => <SafeguardingStatusBadge status={row.status} />,
    },
    {
      key: 'sla_status',
      header: t('columns.sla'),
      render: (row: ConcernRow) => <SlaIndicator status={row.sla_status} />,
    },
    {
      key: 'assigned_to_name',
      header: t('columns.assigned'),
      render: (row: ConcernRow) => (
        <span className="text-sm text-text-secondary">{row.assigned_to_name ?? '—'}</span>
      ),
    },
    {
      key: 'reported_at',
      header: t('columns.date'),
      render: (row: ConcernRow) => (
        <span className="font-mono text-xs text-text-tertiary">{formatDate(row.reported_at)}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="space-y-3">
      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-tertiary">{t('filters.status')}:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleFilter(statusFilters, s, setStatusFilters)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilters.has(s)
                ? 'bg-primary text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Severity chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-tertiary">{t('filters.severity')}:</span>
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleFilter(severityFilters, s, setSeverityFilters)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              severityFilters.has(s)
                ? 'bg-primary text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* SLA dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-tertiary">{t('filters.sla')}:</span>
        <Select value={slaFilter} onValueChange={(v) => { setSlaFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder={t('filters.slaStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {SLA_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/safeguarding/concerns/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('reportConcern')}
            </Button>
          </Link>
        }
      />

      {/* Mobile card view */}
      <div className="block md:hidden">
        {toolbar}
        {isLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-tertiary">
            {t('noConcerns')}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.map((concern) => (
              <ConcernCard
                key={concern.id}
                concern={concern}
                onClick={() => router.push(`/${locale}/safeguarding/concerns/${concern.id}`)}
              />
            ))}
            {/* Simple mobile pagination */}
            <div className="flex items-center justify-between pt-2 text-sm text-text-secondary">
              <span>
                {total === 0 ? t('noResults') : t('pagination', { page, totalPages: Math.ceil(total / PAGE_SIZE) })}
              </span>
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
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/safeguarding/concerns/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
