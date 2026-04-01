'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import type { RiskProfileListItem, RiskProfileListResponse } from '@/lib/early-warning';
import { TIER_ORDER } from '@/lib/early-warning';

import { RiskTierBadge } from './risk-tier-badge';
import { StudentDetailPanel } from './student-detail-panel';
import { TrendSparkline } from './trend-sparkline';

const PAGE_SIZE = 20;

interface YearGroupOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

export function EarlyWarningList() {
  const t = useTranslations('early_warning');

  // ─── State ──────────────────────────────────────────────────────────────────
  const [data, setData] = React.useState<RiskProfileListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [tierFilter, setTierFilter] = React.useState('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');

  // Filter options (fetched once)
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);

  // Detail panel
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  // ─── Fetch filter options ───────────────────────────────────────────────────
  React.useEffect(() => {
    apiClient<{ data: YearGroupOption[] }>('/api/v1/year-groups', { silent: true })
      .then((res) => setYearGroups(res.data ?? []))
      .catch(() => setYearGroups([]));

    apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200', { silent: true })
      .then((res) => setClasses(res.data ?? []))
      .catch(() => setClasses([]));
  }, []);

  // ─── Fetch list data ───────────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
      if (classFilter !== 'all') params.set('class_id', classFilter);

      const res = await apiClient<RiskProfileListResponse>(
        `/api/v1/early-warnings?${params.toString()}`,
      );
      setData(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      console.error('[EarlyWarningList]', err);
      toast.error(t('errors.load_failed'));
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, tierFilter, yearGroupFilter, classFilter, t]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const openDetail = (item: RiskProfileListItem) => {
    setSelectedStudentId(item.student_id);
    setPanelOpen(true);
  };

  const handleAcknowledged = () => {
    void fetchData();
  };

  // ─── Toolbar (filters) ─────────────────────────────────────────────────────
  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        value={tierFilter}
        onValueChange={(v) => {
          setTierFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('list.filter_tier')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_tiers')}</SelectItem>
          {TIER_ORDER.map((tier) => (
            <SelectItem key={tier} value={tier}>
              {t(`summary.${tier}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={yearGroupFilter}
        onValueChange={(v) => {
          setYearGroupFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('cohort.year_group')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_year_groups')}</SelectItem>
          {yearGroups.map((yg) => (
            <SelectItem key={yg.id} value={yg.id}>
              {yg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={classFilter}
        onValueChange={(v) => {
          setClassFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('cohort.class')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_classes')}</SelectItem>
          {classes.map((cls) => (
            <SelectItem key={cls.id} value={cls.id}>
              {cls.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'student_name',
      header: t('list.student'),
      render: (row: RiskProfileListItem) => (
        <div>
          <p className="font-medium text-text-primary">{row.student_name}</p>
          {row.year_group_name && (
            <p className="mt-0.5 text-xs text-text-tertiary">
              {row.year_group_name}
              {row.class_name ? ` · ${row.class_name}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'composite_score',
      header: t('list.score'),
      render: (row: RiskProfileListItem) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {row.composite_score.toFixed(0)}
        </span>
      ),
      className: 'w-20',
    },
    {
      key: 'risk_tier',
      header: t('list.tier'),
      render: (row: RiskProfileListItem) => <RiskTierBadge tier={row.risk_tier} />,
      className: 'w-36',
    },
    {
      key: 'top_signal',
      header: t('list.top_signal'),
      render: (row: RiskProfileListItem) => (
        <p className="max-w-xs truncate text-sm text-text-secondary">
          {row.top_signal ?? t('list.no_signals')}
        </p>
      ),
    },
    {
      key: 'trend',
      header: t('list.trend'),
      render: (row: RiskProfileListItem) => <TrendSparkline data={row.trend_data} />,
      className: 'w-24',
    },
    {
      key: 'assigned_to',
      header: t('list.assigned_to'),
      render: (row: RiskProfileListItem) => (
        <span className="text-sm text-text-secondary">
          {row.assigned_to_name ?? t('list.unassigned')}
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Mobile card layout */}
      <div className="space-y-4 md:hidden">
        {toolbar}
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
          ))
        ) : data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm text-text-tertiary">{t('list.no_data')}</p>
          </div>
        ) : (
          data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openDetail(item)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <RiskTierBadge tier={item.risk_tier} />
                    <span className="font-mono text-sm font-medium text-text-primary">
                      {item.composite_score.toFixed(0)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-text-primary">{item.student_name}</p>
                  {item.top_signal && (
                    <p className="mt-1 truncate text-xs text-text-secondary">{item.top_signal}</p>
                  )}
                </div>
                <TrendSparkline data={item.trend_data} width={60} height={20} />
              </div>
            </button>
          ))
        )}

        {/* Mobile pagination */}
        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('list.previous')}
            </Button>
            <span className="text-sm text-text-secondary">
              {page} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              {t('list.next')}
            </Button>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={openDetail}
          keyExtractor={(row) => row.id}
          isLoading={loading}
        />
      </div>

      {/* Student detail slide-over */}
      <StudentDetailPanel
        studentId={selectedStudentId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onAcknowledged={handleAcknowledged}
      />
    </>
  );
}
