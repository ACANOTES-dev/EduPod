'use client';

import { AlertTriangle, CalendarClock, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InterventionRow {
  id: string;
  title: string;
  intervention_type: string;
  status: string;
  start_date: string;
  target_end_date: string | null;
  next_review_date: string | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  assigned_to_user: {
    first_name: string;
    last_name: string;
  } | null;
}

interface InterventionsResponse {
  data: InterventionRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['active', 'overdue', 'monitoring', 'completed', 'all'] as const;

type TabKey = (typeof TAB_KEYS)[number];

const TYPE_COLORS: Record<string, string> = {
  behaviour_plan: 'bg-blue-100 text-blue-700',
  mentoring: 'bg-purple-100 text-purple-700',
  counselling_referral: 'bg-pink-100 text-pink-700',
  restorative: 'bg-green-100 text-green-700',
  academic_support: 'bg-amber-100 text-amber-700',
  parent_engagement: 'bg-teal-100 text-teal-700',
  external_agency: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  monitoring: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  closed_unsuccessful: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-500',
};

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InterventionListPage() {
  const t = useTranslations('behaviour.interventions');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<InterventionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [activeTab, setActiveTab] = React.useState<TabKey>(
    (searchParams?.get('tab') as TabKey | undefined) ?? 'active',
  );

  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch interventions
  const fetchInterventions = React.useCallback(async (p: number, tab: TabKey) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (tab !== 'all') params.set('status', tab);
      const res = await apiClient<InterventionsResponse>(
        `/api/v1/behaviour/interventions?${params.toString()}`,
      );
      setData(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchInterventions(page, activeTab);
  }, [page, activeTab, fetchInterventions]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  // ─── DataTable columns ─────────────────────────────────────────────────

  const columns = [
    {
      key: 'student',
      header: t('columns.student'),
      render: (row: InterventionRow) => (
        <span className="text-sm font-medium text-text-primary">
          {row.student ? `${row.student.first_name} ${row.student.last_name}` : '—'}
        </span>
      ),
    },
    {
      key: 'title',
      header: t('columns.intervention'),
      render: (row: InterventionRow) => (
        <span className="text-sm text-text-primary">{row.title}</span>
      ),
    },
    {
      key: 'type',
      header: t('columns.type'),
      render: (row: InterventionRow) => (
        <Badge
          variant="secondary"
          className={`text-xs ${TYPE_COLORS[row.intervention_type] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {t(`types.${row.intervention_type}` as Parameters<typeof t>[0])}
        </Badge>
      ),
    },
    {
      key: 'assigned_to',
      header: t('columns.assignedTo'),
      render: (row: InterventionRow) => (
        <span className="text-sm text-text-secondary">
          {row.assigned_to_user
            ? `${row.assigned_to_user.first_name} ${row.assigned_to_user.last_name}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'start_date',
      header: t('columns.startDate'),
      render: (row: InterventionRow) => (
        <span className="font-mono text-xs text-text-primary">{formatDate(row.start_date)}</span>
      ),
    },
    {
      key: 'next_review',
      header: t('columns.nextReview'),
      render: (row: InterventionRow) => {
        if (!row.next_review_date) return <span className="text-text-tertiary">—</span>;
        const overdue = isOverdue(row.next_review_date);
        return (
          <span
            className={`font-mono text-xs ${overdue ? 'font-semibold text-red-600' : 'text-text-primary'}`}
          >
            {formatDate(row.next_review_date)}
            {overdue && <AlertTriangle className="ms-1 inline h-3 w-3" />}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: InterventionRow) => (
        <Badge
          variant="secondary"
          className={`text-xs capitalize ${STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {row.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
  ];

  // ─── Mobile card ────────────────────────────────────────────────────────

  const renderMobileCard = (row: InterventionRow) => {
    const overdue = isOverdue(row.next_review_date);
    return (
      <button
        key={row.id}
        type="button"
        onClick={() => router.push(`/${locale}/behaviour/interventions/${row.id}`)}
        className="w-full rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{row.title}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {row.student ? `${row.student.first_name} ${row.student.last_name}` : '—'}
              </span>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={`shrink-0 text-xs capitalize ${STATUS_COLORS[row.status] ?? ''}`}
          >
            {row.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className={`text-xs ${TYPE_COLORS[row.intervention_type] ?? ''}`}
          >
            {t(`types.${row.intervention_type}` as Parameters<typeof t>[0])}
          </Badge>
          {row.next_review_date && (
            <span
              className={`flex items-center gap-1 text-xs ${overdue ? 'font-semibold text-red-600' : 'text-text-tertiary'}`}
            >
              <CalendarClock className="h-3 w-3" />
              {formatDate(row.next_review_date)}
            </span>
          )}
          {row.assigned_to_user && (
            <span className="text-xs text-text-tertiary">
              {row.assigned_to_user.first_name} {row.assigned_to_user.last_name}
            </span>
          )}
        </div>
      </button>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/behaviour/interventions/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('newIntervention')}
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTabChange(key)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t(`tabs.${key}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: Cards / Desktop: Table */}
      {isMobile ? (
        <div>
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">{t('noResults')}</p>
            ) : (
              data.map(renderMobileCard)
            )}
          </div>
          {/* Mobile pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>{t('pagination', { page, total: Math.ceil(total / PAGE_SIZE) })}</span>
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
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/behaviour/interventions/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
