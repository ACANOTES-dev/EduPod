'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { IncidentCard, type IncidentCardData } from '@/components/behaviour/incident-card';
import { IncidentStatusBadge } from '@/components/behaviour/incident-status-badge';
import { QuickLogFab } from '@/components/behaviour/quick-log-fab';
import { QuickLogSheet } from '@/components/behaviour/quick-log-sheet';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentRow {
  id: string;
  incident_number: string;
  description: string;
  status: string;
  occurred_at: string;
  category: {
    name: string;
    polarity: string;
    color: string | null;
  } | null;
  reported_by_user: { first_name: string; last_name: string } | null;
  participants: Array<{
    student?: { first_name: string; last_name: string } | null;
  }>;
}

interface IncidentsResponse {
  data: IncidentRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface CategoryOption {
  id: string;
  name: string;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['all', 'positive', 'negative', 'pending', 'escalated', 'my'] as const;

type TabKey = (typeof TAB_KEYS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IncidentListPage() {
  const t = useTranslations('behaviour.incidents');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<IncidentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [quickLogOpen, setQuickLogOpen] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState<TabKey>(
    (searchParams?.get('tab') as TabKey) ?? 'all',
  );
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);

  const isMobile = useIsMobile();

  // Load categories
  React.useEffect(() => {
    apiClient<{ data: CategoryOption[] }>(
      '/api/v1/behaviour/categories?pageSize=100&is_active=true',
    )
      .then((res) => setCategories(res.data ?? []))
      .catch((err) => { console.error('[BehaviourIncidentsPage]', err); });
  }, []);

  // Fetch incidents
  const fetchIncidents = React.useCallback(
    async (p: number, tab: TabKey, status: string, cat: string, from: string, to: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (tab !== 'all') params.set('tab', tab);
        if (status !== 'all') params.set('status', status);
        if (cat !== 'all') params.set('category_id', cat);
        if (from) params.set('date_from', from);
        if (to) params.set('date_to', to);
        const res = await apiClient<IncidentsResponse>(
          `/api/v1/behaviour/incidents?${params.toString()}`,
        );
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (err) {
        console.error('[BehaviourIncidentsPage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchIncidents(page, activeTab, statusFilter, categoryFilter, dateFrom, dateTo);
  }, [page, activeTab, statusFilter, categoryFilter, dateFrom, dateTo, fetchIncidents]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  const getStudentNames = (row: IncidentRow) =>
    row.participants
      .map((p) => (p.student ? `${p.student.first_name} ${p.student.last_name}` : null))
      .filter(Boolean)
      .join(', ') || '—';

  // ─── DataTable columns ─────────────────────────────────────────────────

  const columns = [
    {
      key: 'occurred_at',
      header: t('columns.date'),
      render: (row: IncidentRow) => (
        <span className="font-mono text-xs text-text-primary">
          {formatDateTime(row.occurred_at)}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('columns.category'),
      render: (row: IncidentRow) =>
        row.category ? (
          <Badge
            variant="secondary"
            className="text-xs"
            style={
              row.category.color
                ? { borderColor: row.category.color, color: row.category.color }
                : undefined
            }
          >
            {row.category.name}
          </Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'students',
      header: t('columns.students'),
      render: (row: IncidentRow) => (
        <span className="text-sm text-text-primary">{getStudentNames(row)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: IncidentRow) => <IncidentStatusBadge status={row.status} />,
    },
    {
      key: 'reporter',
      header: t('columns.reporter'),
      render: (row: IncidentRow) =>
        row.reported_by_user ? (
          <span className="text-sm text-text-secondary">
            {row.reported_by_user.first_name} {row.reported_by_user.last_name}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
  ];

  // ─── Toolbar ───────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => {
          setDateFrom(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label={t('filters.dateFrom')}
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => {
          setDateTo(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label={t('filters.dateTo')}
      />
      <Select
        value={categoryFilter}
        onValueChange={(v) => {
          setCategoryFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('filters.category')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allCategories')}</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
          <SelectItem value="active">{t('statuses.active')}</SelectItem>
          <SelectItem value="investigating">{t('statuses.investigating')}</SelectItem>
          <SelectItem value="escalated">{t('statuses.escalated')}</SelectItem>
          <SelectItem value="resolved">{t('statuses.resolved')}</SelectItem>
          <SelectItem value="withdrawn">{t('statuses.withdrawn')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/behaviour/incidents/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('newIncident')}
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
          {toolbar}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">{t('noResults')}</p>
            ) : (
              data.map((row) => (
                <IncidentCard
                  key={row.id}
                  incident={row as IncidentCardData}
                  onClick={() => router.push(`/${locale}/behaviour/incidents/${row.id}`)}
                />
              ))
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
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/behaviour/incidents/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Quick Log FAB + Sheet */}
      <QuickLogFab onClick={() => setQuickLogOpen(true)} />
      <QuickLogSheet open={quickLogOpen} onOpenChange={setQuickLogOpen} />
    </div>
  );
}
