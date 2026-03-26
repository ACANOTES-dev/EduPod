'use client';

import { Button } from '@school/ui';
import { AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExclusionRow {
  id: string;
  case_number: string;
  type: string;
  status: string;
  formal_notice_issued_at: string | null;
  hearing_date: string | null;
  decision: string | null;
  appeal_deadline: string | null;
  statutory_timeline: Array<{
    step: string;
    required_by: string | null;
    completed_at: string | null;
    status: string;
  }> | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface ExclusionsResponse {
  data: ExclusionRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  notice_issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  hearing_held: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  decision_made: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  appeal_window: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  finalised: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  overturned: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  suspension_extended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  expulsion: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  managed_move: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  permanent_exclusion: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const DECISION_COLORS: Record<string, string> = {
  exclusion_confirmed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  exclusion_modified: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  exclusion_reversed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  alternative_consequence: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getComplianceIndicator(
  timeline: ExclusionRow['statutory_timeline'],
): 'ok' | 'warning' | 'overdue' {
  if (!timeline || timeline.length === 0) return 'ok';
  const hasOverdue = timeline.some((s) => s.status === 'overdue');
  if (hasOverdue) return 'overdue';
  const hasPending = timeline.some((s) => s.status === 'pending');
  if (hasPending) return 'warning';
  return 'ok';
}

function getDaysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diff = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'initiated', label: 'Initiated' },
  { key: 'notice_issued', label: 'Notice Issued' },
  { key: 'hearing_scheduled', label: 'Hearing Scheduled' },
  { key: 'decision_made', label: 'Decision Made' },
  { key: 'appeal_window', label: 'Appeal Window' },
  { key: 'finalised', label: 'Finalised' },
  { key: 'overturned', label: 'Overturned' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExclusionListPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<ExclusionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('all');

  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch exclusion cases
  const fetchExclusions = React.useCallback(
    async (p: number, tab: TabKey) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (tab !== 'all') params.set('status', tab);
        const res = await apiClient<ExclusionsResponse>(
          `/api/v1/behaviour/exclusion-cases?${params.toString()}`,
        );
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
    void fetchExclusions(page, activeTab);
  }, [page, activeTab, fetchExclusions]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  // ─── DataTable columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'compliance',
      header: '',
      className: 'w-8',
      render: (row: ExclusionRow) => {
        const indicator = getComplianceIndicator(row.statutory_timeline);
        if (indicator === 'overdue') {
          return (
            <span title="Statutory step overdue">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </span>
          );
        }
        if (indicator === 'warning') {
          return (
            <span title="Statutory step pending">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </span>
          );
        }
        return null;
      },
    },
    {
      key: 'case_number',
      header: 'Case #',
      render: (row: ExclusionRow) => (
        <span className="font-mono text-xs font-medium text-text-primary">
          {row.case_number}
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (row: ExclusionRow) =>
        row.student ? (
          <span className="text-sm text-text-primary">
            {row.student.first_name} {row.student.last_name}
          </span>
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: ExclusionRow) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          {formatLabel(row.type)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ExclusionRow) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          {formatLabel(row.status)}
        </span>
      ),
    },
    {
      key: 'notice_issued',
      header: 'Notice Issued',
      render: (row: ExclusionRow) => (
        <span className="text-xs text-text-secondary">
          {row.formal_notice_issued_at
            ? formatDateTime(row.formal_notice_issued_at)
            : '--'}
        </span>
      ),
    },
    {
      key: 'hearing_date',
      header: 'Hearing',
      render: (row: ExclusionRow) => (
        <span className="text-xs text-text-secondary">
          {row.hearing_date ? formatDate(row.hearing_date) : '--'}
        </span>
      ),
    },
    {
      key: 'decision',
      header: 'Decision',
      render: (row: ExclusionRow) =>
        row.decision ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_COLORS[row.decision] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
          >
            {formatLabel(row.decision)}
          </span>
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'appeal_deadline',
      header: 'Appeal Deadline',
      render: (row: ExclusionRow) => {
        if (!row.appeal_deadline) {
          return <span className="text-text-tertiary">--</span>;
        }
        const days = getDaysRemaining(row.appeal_deadline);
        const dateStr = formatDate(row.appeal_deadline);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-text-secondary">{dateStr}</span>
            {days !== null && days >= 0 && (
              <span
                className={`text-xs font-medium ${
                  days < 3
                    ? 'text-red-600 dark:text-red-400'
                    : days < 5
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-text-tertiary'
                }`}
              >
                {days === 0 ? 'Today' : `${days}d remaining`}
              </span>
            )}
            {days !== null && days < 0 && (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                Expired
              </span>
            )}
          </div>
        );
      },
    },
  ];

  // ─── Mobile Card ────────────────────────────────────────────────────────

  const renderMobileCard = (row: ExclusionRow) => {
    const indicator = getComplianceIndicator(row.statutory_timeline);
    const days = getDaysRemaining(row.appeal_deadline);

    return (
      <div
        key={row.id}
        className="cursor-pointer rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
        onClick={() => router.push(`/${locale}/behaviour/exclusions/${row.id}`)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {indicator === 'overdue' && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              {indicator === 'warning' && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className="font-mono text-xs font-medium text-text-primary">
                {row.case_number}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-primary">
              {row.student
                ? `${row.student.first_name} ${row.student.last_name}`
                : '--'}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
          >
            {formatLabel(row.status)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[row.type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
          >
            {formatLabel(row.type)}
          </span>
          {row.decision && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_COLORS[row.decision] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              {formatLabel(row.decision)}
            </span>
          )}
          {days !== null && days >= 0 && (
            <span
              className={`text-xs font-medium ${
                days < 3
                  ? 'text-red-600 dark:text-red-400'
                  : days < 5
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-text-tertiary'
              }`}
            >
              Appeal: {days === 0 ? 'Today' : `${days}d`}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exclusion Cases"
        description="Formal exclusion proceedings and statutory compliance"
        actions={
          <Link href={`/${locale}/behaviour`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              Behaviour
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab.label}
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
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-xl bg-surface-secondary"
                />
              ))
            ) : data.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface py-12 text-center">
                <ShieldAlert className="mx-auto h-8 w-8 text-text-tertiary" />
                <p className="mt-2 text-sm text-text-tertiary">
                  No exclusion cases found
                </p>
              </div>
            ) : (
              data.map(renderMobileCard)
            )}
          </div>
          {/* Mobile pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
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
          onRowClick={(row) =>
            router.push(`/${locale}/behaviour/exclusions/${row.id}`)
          }
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
