'use client';

import { Calendar, CheckCircle, ExternalLink, List } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SanctionRow {
  id: string;
  sanction_number: string;
  type: string;
  status: string;
  scheduled_date: string;
  notes: string | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  supervised_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  incident: {
    id: string;
    incident_number: string;
    description: string;
  } | null;
}

interface SanctionsResponse {
  data: SanctionRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── View Tabs ───────────────────────────────────────────────────────────────

const VIEW_TAB_KEYS = [
  { key: 'list', icon: List },
  { key: 'calendar', icon: Calendar },
] as const;

type ViewTab = (typeof VIEW_TAB_KEYS)[number]['key'];

// ─── Sanction Type / Status Config ───────────────────────────────────────────

const TYPE_BADGE_CLASSES: Record<string, string> = {
  detention: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  suspension_internal: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  suspension_external: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expulsion: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
  community_service: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  loss_of_privilege: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  restorative_meeting: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  served: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  appealed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partially_served: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  excused: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  rescheduled: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  not_served_absent: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  replaced: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  superseded: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const t = useTranslations('behaviour.sanctions');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TYPE_BADGE_CLASSES[type] ?? TYPE_BADGE_CLASSES.other
      }`}
    >
      {t(`types.${type}` as Parameters<typeof t>[0])}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('behaviour.sanctions');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ??
        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {t(`statuses.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SanctionListPage() {
  const t = useTranslations('behaviour.sanctions');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<SanctionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [markingServed, setMarkingServed] = React.useState<string | null>(null);

  const [viewTab, setViewTab] = React.useState<ViewTab>('list');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  const isMobile = useIsMobile();

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch sanctions
  const fetchSanctions = React.useCallback(
    async (p: number, type: string, status: string, from: string, to: string, search: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (type !== 'all') params.set('type', type);
        if (status !== 'all') params.set('status', status);
        if (from) params.set('date_from', from);
        if (to) params.set('date_to', to);
        if (search) params.set('student_search', search);
        const res = await apiClient<SanctionsResponse>(
          `/api/v1/behaviour/sanctions?${params.toString()}`,
        );
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (err) {
        console.error('[BehaviourSanctionsPage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchSanctions(page, typeFilter, statusFilter, dateFrom, dateTo, debouncedSearch);
  }, [page, typeFilter, statusFilter, dateFrom, dateTo, debouncedSearch, fetchSanctions]);

  // Mark single sanction as served
  const handleMarkServed = async (sanctionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMarkingServed(sanctionId);
    try {
      await apiClient(`/api/v1/behaviour/sanctions/${sanctionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'served' }),
      });
      // Refresh list
      void fetchSanctions(page, typeFilter, statusFilter, dateFrom, dateTo, debouncedSearch);
    } catch (err) {
      console.error('[markServed]', err);
    } finally {
      setMarkingServed(null);
    }
  };

  // ─── DataTable columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'sanction_number',
      header: '#',
      render: (row: SanctionRow) => (
        <span className="font-mono text-xs font-medium text-text-primary">
          {row.sanction_number}
        </span>
      ),
    },
    {
      key: 'student',
      header: t('columns.student'),
      render: (row: SanctionRow) => (
        <span className="text-sm font-medium text-text-primary">
          {row.student ? `${row.student.first_name} ${row.student.last_name}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'type',
      header: t('columns.type'),
      render: (row: SanctionRow) => <TypeBadge type={row.type} />,
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: SanctionRow) => <StatusBadge status={row.status} />,
    },
    {
      key: 'scheduled_date',
      header: t('columns.scheduled'),
      render: (row: SanctionRow) => (
        <span className="font-mono text-xs text-text-primary">
          {formatDate(row.scheduled_date)}
        </span>
      ),
    },
    {
      key: 'supervised_by',
      header: t('columns.supervisedBy'),
      render: (row: SanctionRow) =>
        row.supervised_by ? (
          <span className="text-sm text-text-secondary">
            {row.supervised_by.first_name} {row.supervised_by.last_name}
          </span>
        ) : (
          <span className="text-text-tertiary">{'\u2014'}</span>
        ),
    },
    {
      key: 'incident',
      header: t('columns.incident'),
      render: (row: SanctionRow) =>
        row.incident ? (
          <Link
            href={`/${locale}/behaviour/incidents/${row.incident.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            {row.incident.incident_number}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-text-tertiary">{'\u2014'}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: SanctionRow) =>
        row.status === 'scheduled' && row.type === 'detention' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={markingServed === row.id}
            onClick={(e) => handleMarkServed(row.id, e)}
            className="shrink-0"
          >
            <CheckCircle className="me-1 h-3.5 w-3.5" />
            {markingServed === row.id ? t('saving') : t('markServed')}
          </Button>
        ) : null,
    },
  ];

  // ─── Toolbar ────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('search')}
        className="w-full text-base sm:w-48 sm:text-sm"
        aria-label={t('search')}
      />
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('filters.type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
          <SelectItem value="detention">{t('types.detention')}</SelectItem>
          <SelectItem value="suspension_internal">{t('types.suspension_internal')}</SelectItem>
          <SelectItem value="suspension_external">{t('types.suspension_external')}</SelectItem>
          <SelectItem value="expulsion">{t('types.expulsion')}</SelectItem>
          <SelectItem value="other">{t('types.other')}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
          <SelectItem value="pending_approval">{t('statuses.pending_approval')}</SelectItem>
          <SelectItem value="scheduled">{t('statuses.scheduled')}</SelectItem>
          <SelectItem value="served">{t('statuses.served')}</SelectItem>
          <SelectItem value="no_show">{t('statuses.no_show')}</SelectItem>
          <SelectItem value="cancelled">{t('statuses.cancelled')}</SelectItem>
          <SelectItem value="appealed">{t('statuses.appealed')}</SelectItem>
        </SelectContent>
      </Select>
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => {
          setDateFrom(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary dark:bg-surface dark:text-text-primary sm:w-auto"
        aria-label={t('filters.dateFrom')}
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => {
          setDateTo(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary dark:bg-surface dark:text-text-primary sm:w-auto"
        aria-label={t('filters.dateTo')}
      />
    </div>
  );

  // ─── Mobile Card ────────────────────────────────────────────────────────

  const renderMobileCard = (row: SanctionRow) => {
    const typeClass = TYPE_BADGE_CLASSES[row.type] ?? TYPE_BADGE_CLASSES.other;
    const accentBorder =
      row.type === 'detention'
        ? 'border-s-amber-500'
        : row.type === 'suspension_internal'
          ? 'border-s-orange-500'
          : row.type === 'suspension_external'
            ? 'border-s-red-500'
            : row.type === 'expulsion'
              ? 'border-s-red-900'
              : 'border-s-gray-400';

    return (
      <button
        key={row.id}
        type="button"
        onClick={() => router.push(`/${locale}/behaviour/sanctions/${row.id}`)}
        className={`w-full rounded-xl border border-border border-s-4 ${accentBorder} bg-surface p-4 text-start transition-colors hover:bg-surface-secondary dark:bg-surface dark:hover:bg-surface-secondary`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {row.student
                ? `${row.student.first_name} ${row.student.last_name}`
                : t('unknownStudent')}
            </p>
            <p className="mt-0.5 font-mono text-xs text-text-tertiary">{row.sanction_number}</p>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeClass}`}
          >
            {t(`types.${row.type}` as Parameters<typeof t>[0])}
          </span>
          <span className="text-xs text-text-tertiary">{formatDate(row.scheduled_date)}</span>
          {row.supervised_by && (
            <span className="text-xs text-text-tertiary">
              {row.supervised_by.first_name} {row.supervised_by.last_name}
            </span>
          )}
        </div>
        {row.status === 'scheduled' && row.type === 'detention' && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={markingServed === row.id}
              onClick={(e) => handleMarkServed(row.id, e)}
            >
              <CheckCircle className="me-1 h-3.5 w-3.5" />
              {markingServed === row.id ? t('saving') : t('markServed')}
            </Button>
          </div>
        )}
      </button>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/${locale}/behaviour/sanctions/today`}>
              <Button variant="outline">{t('todaysDetentions')}</Button>
            </Link>
          </div>
        }
      />

      {/* View Toggle Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {VIEW_TAB_KEYS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  viewTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`tabs.${tab.key}` as Parameters<typeof t>[0])}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar stub */}
      {viewTab === 'calendar' ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center dark:bg-surface">
          <Calendar className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm font-medium text-text-primary">{t('calendarComingSoon')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('calendarComingSoonDescription')}</p>
        </div>
      ) : (
        <>
          {/* List View */}
          {isMobile ? (
            <div>
              {toolbar}
              <div className="mt-4 space-y-2">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
                  ))
                ) : data.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface py-12 text-center dark:bg-surface">
                    <Badge variant="secondary" className="mx-auto mb-2">
                      {t('noResults')}
                    </Badge>
                    <p className="text-sm text-text-tertiary">{t('noResultsDescription')}</p>
                  </div>
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
              toolbar={toolbar}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              onRowClick={(row) => router.push(`/${locale}/behaviour/sanctions/${row.id}`)}
              keyExtractor={(row) => row.id}
              isLoading={isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}
