'use client';

import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Search, UserPlus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppealRow {
  id: string;
  appeal_number: string;
  entity_type: string;
  status: string;
  grounds_category: string;
  submitted_at: string | null;
  hearing_date: string | null;
  decision: string | null;
  student: { id: string; first_name: string; last_name: string } | null;
  incident: { id: string; incident_number: string } | null;
  sanction: { id: string; sanction_number: string; type: string } | null;
  reviewer: { id: string; first_name: string; last_name: string } | null;
}

interface AppealsResponse {
  data: AppealRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
}

// ─── Badge maps ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  decided: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  withdrawn: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  withdrawn_appeal: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

const GROUNDS_COLORS: Record<string, string> = {
  factual_inaccuracy: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  disproportionate_consequence:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  procedural_error: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  mitigating_circumstances: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  mistaken_identity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  other_grounds: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

const DECISION_COLORS: Record<string, string> = {
  upheld_original: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
  modified: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  overturned: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

function StatusBadgeInline({
  value,
  colorMap,
}: {
  value: string;
  colorMap: Record<string, string>;
}) {
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const color =
    colorMap[value] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS = [
  'all',
  'submitted',
  'under_review',
  'hearing_scheduled',
  'decided',
  'withdrawn',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AppealsListPage() {
  const t = useTranslations('behaviour.appeals');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<AppealRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [activeTab, setActiveTab] = React.useState<TabKey>('all');
  const [groundsFilter, setGroundsFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [search, setSearch] = React.useState('');

  // Assign reviewer dialog
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignAppealId, setAssignAppealId] = React.useState('');
  const [selectedReviewerId, setSelectedReviewerId] = React.useState('');
  const [staffList, setStaffList] = React.useState<StaffOption[]>([]);
  const [assignLoading, setAssignLoading] = React.useState(false);

  const isMobile = useIsMobile();

  // ─── Fetch appeals ──────────────────────────────────────────────────────────

  const fetchAppeals = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (activeTab !== 'all') params.set('status', activeTab);
      if (groundsFilter !== 'all') params.set('grounds_category', groundsFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (search) params.set('student_id', search);

      const res = await apiClient<AppealsResponse>(
        `/api/v1/behaviour/appeals?${params.toString()}`,
      );
      setData(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, activeTab, groundsFilter, dateFrom, dateTo, search]);

  React.useEffect(() => {
    void fetchAppeals();
  }, [fetchAppeals]);

  // Reset page on filter change
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  // ─── Load staff for reviewer assignment ─────────────────────────────────────

  const loadStaff = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: StaffOption[] }>('/api/v1/staff?pageSize=200');
      setStaffList(res.data ?? []);
    } catch {
      setStaffList([]);
    }
  }, []);

  const openAssignDialog = (appealId: string) => {
    setAssignAppealId(appealId);
    setSelectedReviewerId('');
    setAssignOpen(true);
    void loadStaff();
  };

  const handleAssignReviewer = async () => {
    if (!selectedReviewerId || !assignAppealId) return;
    setAssignLoading(true);
    try {
      await apiClient(`/api/v1/behaviour/appeals/${assignAppealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewer_id: selectedReviewerId }),
      });
      toast.success(t('reviewerAssigned'));
      setAssignOpen(false);
      void fetchAppeals();
    } catch {
      toast.error(t('failedToAssign'));
    } finally {
      setAssignLoading(false);
    }
  };

  // ─── Helper renderers ──────────────────────────────────────────────────────

  const getStudentName = (row: AppealRow) =>
    row.student ? `${row.student.first_name} ${row.student.last_name}` : '--';

  const getReviewerName = (row: AppealRow) =>
    row.reviewer ? `${row.reviewer.first_name} ${row.reviewer.last_name}` : '--';

  // ─── DataTable columns ──────────────────────────────────────────────────────

  const columns = [
    {
      key: 'appeal_number',
      header: t('columns.appealNumber'),
      render: (row: AppealRow) => (
        <span className="font-mono text-xs text-text-secondary">{row.appeal_number}</span>
      ),
    },
    {
      key: 'student',
      header: t('columns.student'),
      render: (row: AppealRow) => (
        <span className="text-sm font-medium text-text-primary">{getStudentName(row)}</span>
      ),
    },
    {
      key: 'entity_type',
      header: t('columns.entity'),
      render: (row: AppealRow) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {row.entity_type}
        </Badge>
      ),
    },
    {
      key: 'grounds_category',
      header: t('columns.grounds'),
      render: (row: AppealRow) => (
        <StatusBadgeInline value={row.grounds_category} colorMap={GROUNDS_COLORS} />
      ),
    },
    {
      key: 'submitted_at',
      header: t('columns.submitted'),
      render: (row: AppealRow) => (
        <span className="text-sm text-text-secondary">{formatDate(row.submitted_at)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: AppealRow) => <StatusBadgeInline value={row.status} colorMap={STATUS_COLORS} />,
    },
    {
      key: 'reviewer',
      header: t('columns.reviewer'),
      render: (row: AppealRow) => (
        <span className="text-sm text-text-secondary">{getReviewerName(row)}</span>
      ),
    },
    {
      key: 'hearing_date',
      header: t('columns.hearing'),
      render: (row: AppealRow) => (
        <span className="text-sm text-text-secondary">{formatDate(row.hearing_date)}</span>
      ),
    },
    {
      key: 'decision',
      header: t('columns.decision'),
      render: (row: AppealRow) =>
        row.decision ? (
          <StatusBadgeInline value={row.decision} colorMap={DECISION_COLORS} />
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: AppealRow) =>
        row.status === 'submitted' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openAssignDialog(row.id);
            }}
          >
            <UserPlus className="me-1 h-3.5 w-3.5" />
            {t('assign')}
          </Button>
        ) : null,
    },
  ];

  // ─── Mobile card view ───────────────────────────────────────────────────────

  function AppealCard({ row }: { row: AppealRow }) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/${locale}/behaviour/appeals/${row.id}`)}
        className="w-full rounded-xl border border-border bg-surface p-4 text-start shadow-sm transition-colors hover:bg-surface-secondary"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-primary">{getStudentName(row)}</p>
            <p className="mt-0.5 font-mono text-xs text-text-tertiary">{row.appeal_number}</p>
          </div>
          <StatusBadgeInline value={row.status} colorMap={STATUS_COLORS} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs capitalize">
            {row.entity_type}
          </Badge>
          <StatusBadgeInline value={row.grounds_category} colorMap={GROUNDS_COLORS} />
          {row.decision && <StatusBadgeInline value={row.decision} colorMap={DECISION_COLORS} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          <span>
            {t('columns.submitted')}: {formatDate(row.submitted_at)}
          </span>
          {row.hearing_date && (
            <span>
              {t('columns.hearing')}: {formatDate(row.hearing_date)}
            </span>
          )}
          {row.reviewer && (
            <span>
              {t('columns.reviewer')}: {getReviewerName(row)}
            </span>
          )}
        </div>
        {row.status === 'submitted' && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openAssignDialog(row.id);
              }}
            >
              <UserPlus className="me-1 h-3.5 w-3.5" />
              {t('assignReviewer')}
            </Button>
          </div>
        )}
      </button>
    );
  }

  // ─── Toolbar ────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-64">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="ps-9"
        />
      </div>
      <Select
        value={groundsFilter}
        onValueChange={(v) => {
          setGroundsFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Grounds" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allGrounds')}</SelectItem>
          <SelectItem value="factual_inaccuracy">{t('filters.factualInaccuracy')}</SelectItem>
          <SelectItem value="disproportionate_consequence">
            {t('filters.disproportionate')}
          </SelectItem>
          <SelectItem value="procedural_error">{t('filters.proceduralError')}</SelectItem>
          <SelectItem value="mitigating_circumstances">
            {t('filters.mitigatingCircumstances')}
          </SelectItem>
          <SelectItem value="mistaken_identity">{t('filters.mistakenIdentity')}</SelectItem>
          <SelectItem value="other">{t('filters.other')}</SelectItem>
        </SelectContent>
      </Select>
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => {
          setDateFrom(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary dark:bg-surface-secondary sm:w-auto"
        aria-label="Date from"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => {
          setDateTo(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary dark:bg-surface-secondary sm:w-auto"
        aria-label="Date to"
      />
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TAB_KEYS.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => handleTabChange(tabKey)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tabKey
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t(`tabs.${tabKey}` as Parameters<typeof t>[0])}
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
                <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">{t('noResults')}</p>
            ) : (
              data.map((row) => <AppealCard key={row.id} row={row} />)
            )}
          </div>
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>{t('pageOf', { page, total: Math.ceil(total / PAGE_SIZE) })}</span>
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
          onRowClick={(row) => router.push(`/${locale}/behaviour/appeals/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Assign Reviewer Dialog */}
      <Modal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title={t('assignReviewer')}
        description={t('assignReviewerDescription')}
        confirmLabel={t('assign')}
        onConfirm={handleAssignReviewer}
        isLoading={assignLoading}
      >
        <div className="space-y-3 py-2">
          <Label>{t('columns.reviewer')}</Label>
          <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('selectStaff')} />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Modal>
    </div>
  );
}
