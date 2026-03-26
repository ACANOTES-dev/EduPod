'use client';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { IncidentCard, type IncidentCardData } from '@/components/behaviour/incident-card';
import { IncidentStatusBadge } from '@/components/behaviour/incident-status-badge';
import { QuickLogFab } from '@/components/behaviour/quick-log-fab';
import { QuickLogSheet } from '@/components/behaviour/quick-log-sheet';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
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

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'positive', label: 'Positive' },
  { key: 'negative', label: 'Negative' },
  { key: 'pending', label: 'Pending' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'my', label: 'My' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IncidentListPage() {
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

  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load categories
  React.useEffect(() => {
    apiClient<{ data: CategoryOption[] }>('/api/v1/behaviour/categories?pageSize=100&is_active=true')
      .then((res) => setCategories(res.data ?? []))
      .catch(() => undefined);
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
        const res = await apiClient<IncidentsResponse>(`/api/v1/behaviour/incidents?${params.toString()}`);
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
    void fetchIncidents(page, activeTab, statusFilter, categoryFilter, dateFrom, dateTo);
  }, [page, activeTab, statusFilter, categoryFilter, dateFrom, dateTo, fetchIncidents]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  const getStudentNames = (row: IncidentRow) =>
    row.participants
      .map((p) => p.student ? `${p.student.first_name} ${p.student.last_name}` : null)
      .filter(Boolean)
      .join(', ') || '—';

  // ─── DataTable columns ─────────────────────────────────────────────────

  const columns = [
    {
      key: 'occurred_at',
      header: 'Date',
      render: (row: IncidentRow) => (
        <span className="font-mono text-xs text-text-primary">
          {formatDateTime(row.occurred_at)}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row: IncidentRow) =>
        row.category ? (
          <Badge
            variant="secondary"
            className="text-xs"
            style={row.category.color ? { borderColor: row.category.color, color: row.category.color } : undefined}
          >
            {row.category.name}
          </Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'students',
      header: 'Student(s)',
      render: (row: IncidentRow) => (
        <span className="text-sm text-text-primary">{getStudentNames(row)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: IncidentRow) => <IncidentStatusBadge status={row.status} />,
    },
    {
      key: 'reporter',
      header: 'Reporter',
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
        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label="Date from"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label="Date to"
      />
      <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="investigating">Investigating</SelectItem>
          <SelectItem value="escalated">Escalated</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="withdrawn">Withdrawn</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Behaviour Incidents"
        actions={
          <Link href={`/${locale}/behaviour/incidents/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              New Incident
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
          {toolbar}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">No incidents found</p>
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
              <span>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage(page + 1)}>
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
