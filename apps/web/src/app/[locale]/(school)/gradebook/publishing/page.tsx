'use client';

import {
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';
import { Globe, SendHorizonal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface PublishingRow {
  id: string;
  assessment_title: string;
  class_name: string;
  subject_name: string;
  graded_count: number;
  total_count: number;
  completion_pct: number;
  is_published: boolean;
  grades_published_at: string | null;
}

interface PublishingResponse {
  data: PublishingRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Completion Bar ────────────────────────────────────────────────────────────

function CompletionBar({ pct, graded, total }: { pct: number; graded: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 100 ? 'bg-success-500' : pct >= 50 ? 'bg-warning-500' : 'bg-danger-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary font-mono" dir="ltr">
        {graded}/{total}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradePublishingPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [classes, setClasses] = React.useState<SelectOption[]>([]);

  const [periodFilter, setPeriodFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');

  const [rows, setRows] = React.useState<PublishingRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;

  const [isLoading, setIsLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [publishing, setPublishing] = React.useState(false);
  const [bulkPublishing, setBulkPublishing] = React.useState(false);

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch(() => undefined);
  }, []);

  const fetchRows = React.useCallback(
    async (p: number, periodId: string, classId: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (periodId !== 'all') params.set('academic_period_id', periodId);
        if (classId !== 'all') params.set('class_id', classId);
        const res = await apiClient<PublishingResponse>(
          `/api/v1/gradebook/publishing/readiness?${params.toString()}`,
        );
        setRows(res.data);
        setTotal(res.meta.total);
      } catch {
        setRows([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchRows(page, periodFilter, classFilter);
  }, [page, periodFilter, classFilter, fetchRows]);

  const unpublishedInPage = rows.filter((r) => !r.is_published);
  const allUnpublishedSelected =
    unpublishedInPage.length > 0 && unpublishedInPage.every((r) => selected.has(r.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(unpublishedInPage.map((r) => r.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handlePublishSelected = async () => {
    if (selected.size === 0) return;
    setPublishing(true);
    try {
      await apiClient('/api/v1/gradebook/publishing/publish', {
        method: 'POST',
        body: JSON.stringify({ assessment_ids: Array.from(selected) }),
      });
      toast.success(t('publishingSuccess', { count: selected.size }));
      setSelected(new Set());
      void fetchRows(page, periodFilter, classFilter);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishAllForPeriod = async () => {
    if (periodFilter === 'all') {
      toast.error(t('publishingSelectPeriodFirst'));
      return;
    }
    setBulkPublishing(true);
    try {
      await apiClient('/api/v1/gradebook/publishing/publish-period', {
        method: 'POST',
        body: JSON.stringify({ academic_period_id: periodFilter }),
      });
      toast.success(t('publishingPeriodSuccess'));
      void fetchRows(page, periodFilter, classFilter);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setBulkPublishing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('publishingTitle')}
        description={t('publishingDescription')}
      />

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allPeriods')}</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectClass')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allClasses')}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handlePublishSelected}
            disabled={selected.size === 0 || publishing}
          >
            <SendHorizonal className="me-2 h-4 w-4" />
            {t('publishingPublishSelected', { count: selected.size })}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePublishAllForPeriod}
            disabled={periodFilter === 'all' || bulkPublishing}
          >
            <Globe className="me-2 h-4 w-4" />
            {t('publishingPublishAllPeriod')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start">
                  <Checkbox
                    checked={allUnpublishedSelected}
                    onCheckedChange={(v) => handleSelectAll(!!v)}
                    aria-label={t('publishingSelectAll')}
                    disabled={unpublishedInPage.length === 0}
                  />
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('publishingAssessment')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('publishingClass')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('subject')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('publishingCompletion')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('publishingStatus')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-b border-border last:border-b-0">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-tertiary">
                    {t('publishingNoData')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors">
                    <td className="px-4 py-3">
                      {!row.is_published && (
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v) => handleSelectRow(row.id, !!v)}
                          aria-label={t('publishingSelectRow')}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.assessment_title}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.class_name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.subject_name}</td>
                    <td className="px-4 py-3">
                      <CompletionBar
                        pct={row.completion_pct}
                        graded={row.graded_count}
                        total={row.total_count}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {row.is_published ? (
                        <div className="space-y-0.5">
                          <StatusBadge status="success">{t('publishingPublished')}</StatusBadge>
                          {row.grades_published_at && (
                            <p className="text-xs text-text-tertiary">
                              {new Date(row.grades_published_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : row.completion_pct >= 100 ? (
                        <StatusBadge status="info">{t('publishingReady')}</StatusBadge>
                      ) : (
                        <StatusBadge status="warning">{t('publishingIncomplete')}</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-text-secondary">
          <span>
            {total === 0
              ? t('publishingNoData')
              : `${startItem}–${endItem} / ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous"
            >
              {'‹'}
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next"
            >
              {'›'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
