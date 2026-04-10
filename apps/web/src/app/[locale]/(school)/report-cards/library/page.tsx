'use client';

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Package,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';

// ─── Types (mirror backend GroupedLibraryRunNode) ───────────────────────────

interface GroupedStudentRow {
  id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  status: 'draft' | 'published' | 'revised' | 'superseded';
  locale: string;
  template: { id: string | null; name: string | null };
  pdf_storage_key: string | null;
  pdf_download_url: string | null;
  generated_at: string;
}

interface GroupedClassNode {
  class_id: string;
  class_name: string;
  year_group: { id: string; name: string } | null;
  student_count: number;
  report_card_count: number;
  report_cards: GroupedStudentRow[];
}

interface GroupedRunNode {
  batch_job_id: string | null;
  run_status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'legacy' | null;
  run_started_at: string;
  run_finished_at: string | null;
  period_label: string;
  template_name: string | null;
  design_key: string | null;
  total_report_cards: number;
  classes: GroupedClassNode[];
}

interface GroupedResponse {
  data: GroupedRunNode[];
}

type ViewMode = 'by_run' | 'by_year_group' | 'by_class';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsLibraryPage() {
  const t = useTranslations('reportCards');
  const tl = useTranslations('reportCards.library');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<GroupedRunNode[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [view, setView] = React.useState<ViewMode>('by_run');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Row ids currently mid-action (publishing/deleting) so we can disable
  // buttons and show loading state per-row.
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  // The confirmation modal is reused for both Delete and Unpublish — both
  // are destructive enough to warrant a guard, and the wire-up is identical.
  // The discriminator is `kind`; the modal renders the matching copy.
  type ConfirmAction = {
    kind: 'delete' | 'unpublish';
    label: string;
    ids: string[];
  };
  const [confirmAction, setConfirmAction] = React.useState<ConfirmAction | null>(null);

  const fetchLibrary = React.useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const res = await apiClient<GroupedResponse>('/api/v1/report-cards/library/grouped');
      setData(res.data ?? []);
    } catch (err) {
      console.error('[ReportCardsLibraryPage.fetchLibrary]', err);
      setData([]);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLibrary();
  }, [fetchLibrary]);

  // ─── Derived groupings ──────────────────────────────────────────────────
  // The backend returns the canonical "by run" shape. Re-deriving the
  // other two views in memory keeps every card a single source of truth
  // without needing a second API call.

  const allRows = React.useMemo<
    Array<
      GroupedStudentRow & {
        class_name: string;
        class_id: string;
        year_group: string | null;
        run_label: string;
      }
    >
  >(
    () =>
      data.flatMap((run) =>
        run.classes.flatMap((cls) =>
          cls.report_cards.map((row) => ({
            ...row,
            class_id: cls.class_id,
            class_name: cls.class_name,
            year_group: cls.year_group?.name ?? null,
            run_label: new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
              calendar: 'gregory',
              numberingSystem: 'latn',
            }).format(new Date(run.run_started_at)),
          })),
        ),
      ),
    [data, locale],
  );

  // ─── Selection helpers ──────────────────────────────────────────────────

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setSelectionBulk = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // ─── Row actions ────────────────────────────────────────────────────────

  const handleDownload = React.useCallback(
    async (row: GroupedStudentRow) => {
      if (!row.pdf_download_url) {
        toast.error(tl('downloadUnavailable'));
        return;
      }
      window.open(row.pdf_download_url, '_blank', 'noopener,noreferrer');
    },
    [tl],
  );

  const withBusy = React.useCallback(async (ids: string[], fn: () => Promise<void>) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }, []);

  const handlePublishRow = React.useCallback(
    (row: GroupedStudentRow) => {
      void withBusy([row.id], async () => {
        try {
          await apiClient(`/api/v1/report-cards/${row.id}/publish`, { method: 'POST' });
          toast.success(tl('publishSuccess'));
          await fetchLibrary();
        } catch (err) {
          console.error('[library.publish]', err);
          toast.error(tl('publishFailed'));
        }
      });
    },
    [withBusy, tl, fetchLibrary],
  );

  const handlePublishBulk = React.useCallback(() => {
    const ids = Array.from(selected);
    void withBusy(ids, async () => {
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          await apiClient(`/api/v1/report-cards/${id}/publish`, { method: 'POST' });
          ok += 1;
        } catch (err) {
          console.error('[library.publishBulk]', err);
          fail += 1;
        }
      }
      if (ok > 0) toast.success(tl('publishBulkSuccess', { count: ok }));
      if (fail > 0) toast.error(tl('publishBulkFailed', { count: fail }));
      clearSelection();
      await fetchLibrary();
    });
  }, [selected, withBusy, tl, fetchLibrary]);

  const executeDelete = React.useCallback(
    async (ids: string[]) => {
      await withBusy(ids, async () => {
        try {
          if (ids.length === 1) {
            await apiClient(`/api/v1/report-cards/${ids[0]}`, { method: 'DELETE' });
          } else {
            await apiClient('/api/v1/report-cards/bulk-delete', {
              method: 'POST',
              body: JSON.stringify({ report_card_ids: ids }),
            });
          }
          toast.success(tl('deleteSuccess', { count: ids.length }));
          clearSelection();
          await fetchLibrary();
        } catch (err) {
          console.error('[library.delete]', err);
          const message =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : tl('deleteFailed');
          toast.error(message);
        } finally {
          setConfirmAction(null);
        }
      });
    },
    [withBusy, tl, fetchLibrary],
  );

  // Round-2 QA B5: unpublish (revise) for already-published rows. Calls
  // POST /v1/report-cards/:id/revise per row — there is no bulk endpoint,
  // so we loop in parallel with publish bulk semantics (count successes
  // and failures separately so partial failures still surface).
  const executeUnpublish = React.useCallback(
    async (ids: string[]) => {
      await withBusy(ids, async () => {
        let ok = 0;
        let fail = 0;
        for (const id of ids) {
          try {
            // eslint-disable-next-line no-await-in-loop -- sequential is fine
            // for the small (<= 25) row counts the library shows in practice
            // and avoids stampeding the backend with N parallel requests.
            await apiClient(`/api/v1/report-cards/${id}/revise`, { method: 'POST' });
            ok += 1;
          } catch (err) {
            console.error('[library.unpublish]', err);
            fail += 1;
          }
        }
        if (ok > 0) toast.success(tl('unpublishBulkSuccess', { count: ok }));
        if (fail > 0) toast.error(tl('unpublishBulkFailed', { count: fail }));
        setConfirmAction(null);
        clearSelection();
        await fetchLibrary();
      });
    },
    [withBusy, tl, fetchLibrary],
  );

  const askDeleteRow = (row: GroupedStudentRow) =>
    setConfirmAction({
      kind: 'delete',
      label: `${row.student.first_name} ${row.student.last_name}`,
      ids: [row.id],
    });

  const askDeleteSelection = () =>
    setConfirmAction({
      kind: 'delete',
      label: tl('selectionCount', { count: selected.size }),
      ids: Array.from(selected),
    });

  const askDeleteClass = (cls: GroupedClassNode) =>
    setConfirmAction({
      kind: 'delete',
      label: `${cls.class_name} · ${cls.report_card_count}`,
      ids: cls.report_cards.map((r) => r.id),
    });

  const askDeleteRun = (run: GroupedRunNode) =>
    setConfirmAction({
      kind: 'delete',
      label: `${run.period_label} · ${run.total_report_cards}`,
      ids: run.classes.flatMap((c) => c.report_cards.map((r) => r.id)),
    });

  // Unpublish helpers — the row variant has no scope ambiguity, but bulk
  // unpublish only operates on rows currently in the 'published' state.
  // Drafts and already-revised rows in the selection are silently skipped
  // because reviseing them would 409.
  const askUnpublishRow = (row: GroupedStudentRow) =>
    setConfirmAction({
      kind: 'unpublish',
      label: `${row.student.first_name} ${row.student.last_name}`,
      ids: [row.id],
    });

  const askUnpublishSelection = () => {
    const publishedIds = allRows
      .filter((r) => selected.has(r.id) && r.status === 'published')
      .map((r) => r.id);
    if (publishedIds.length === 0) {
      toast.error(tl('unpublishNoneSelected'));
      return;
    }
    setConfirmAction({
      kind: 'unpublish',
      label: tl('selectionCount', { count: publishedIds.length }),
      ids: publishedIds,
    });
  };

  // ─── Bundle download ────────────────────────────────────────────────────

  const downloadBundle = React.useCallback(
    async (params: {
      class_ids?: string[];
      report_card_ids?: string[];
      merge_mode: 'single' | 'per_class';
    }) => {
      const qs = new URLSearchParams();
      if (params.class_ids) {
        for (const id of params.class_ids) qs.append('class_ids', id);
      }
      if (params.report_card_ids) {
        for (const id of params.report_card_ids) qs.append('report_card_ids', id);
      }
      qs.set('merge_mode', params.merge_mode);
      qs.set('locale', 'en');
      // The bundle endpoint streams a binary response — we can't use
      // apiClient which JSON-parses. Use fetch + Authorization header
      // from the same source.
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`/api/v1/report-cards/library/bundle-pdf?${qs.toString()}`, {
          credentials: 'include',
          headers,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const filename =
          extractFilename(res.headers.get('content-disposition')) ??
          (params.merge_mode === 'per_class' ? 'report-cards.zip' : 'report-cards.pdf');
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('[library.downloadBundle]', err);
        toast.error(tl('bundleFailed'));
      }
    },
    [tl],
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRow = (row: GroupedStudentRow) => {
    const busy = busyIds.has(row.id);
    const isChecked = selected.has(row.id);
    const statusLabel = tl(`status_${row.status}`);
    return (
      <tr
        key={row.id}
        className={`border-b border-border last:border-b-0 ${isChecked ? 'bg-primary-50/40' : ''}`}
      >
        <td className="px-3 py-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={isChecked}
            onChange={() => toggleSelected(row.id)}
            aria-label={tl('selectRowAria', {
              name: `${row.student.first_name} ${row.student.last_name}`,
            })}
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary">
              {row.student.first_name} {row.student.last_name}
            </span>
            {row.student.student_number && (
              <span className="text-xs text-text-tertiary tabular-nums" dir="ltr">
                {row.student.student_number}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${
              row.status === 'published'
                ? 'bg-success-50 text-success-700 ring-success-200'
                : row.status === 'revised'
                  ? 'bg-amber-50 text-amber-700 ring-amber-200'
                  : 'bg-primary-50 text-primary-700 ring-primary-200'
            }`}
          >
            {statusLabel}
          </span>
        </td>
        <td className="px-3 py-2 text-xs uppercase text-text-secondary" dir="ltr">
          {row.locale}
        </td>
        <td className="px-3 py-2 text-xs text-text-tertiary tabular-nums" dir="ltr">
          {formatDateTime(row.generated_at, locale)}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(row)}
              disabled={busy || !row.pdf_download_url}
              title={tl('downloadAction')}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            {row.status === 'draft' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePublishRow(row)}
                disabled={busy}
                title={tl('publishAction')}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
            {row.status === 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => askUnpublishRow(row)}
                disabled={busy}
                title={tl('unpublishAction')}
              >
                <Undo2 className="h-3.5 w-3.5 text-amber-600" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => askDeleteRow(row)}
              disabled={busy || row.status === 'published'}
              title={
                row.status === 'published' ? tl('deleteDisabledPublished') : tl('deleteAction')
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const renderClassNode = (cls: GroupedClassNode, parentKey: string) => {
    const classKey = `${parentKey}::${cls.class_id}`;
    const isOpen = expanded.has(classKey);
    const classRowIds = cls.report_cards.map((r) => r.id);
    const allInSelection = classRowIds.every((id) => selected.has(id));
    return (
      <div key={classKey} className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => toggleExpand(classKey)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-secondary"
            aria-label={isOpen ? tl('collapseAria') : tl('expandAria')}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={allInSelection}
            onChange={(e) => setSelectionBulk(classRowIds, e.target.checked)}
            aria-label={tl('selectClassAria', { name: cls.class_name })}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              {cls.class_name}
              {cls.year_group && (
                <span className="text-xs font-normal text-text-tertiary">
                  · {cls.year_group.name}
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary">
              {tl('classSummary', { students: cls.student_count, docs: cls.report_card_count })}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadBundle({ class_ids: [cls.class_id], merge_mode: 'single' })
              }
              title={tl('bundleClass')}
            >
              <Package className="me-1.5 h-3.5 w-3.5" />
              {tl('bundleClass')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => askDeleteClass(cls)}
              title={tl('deleteClass')}
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        </div>
        {isOpen && (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-surface-secondary/40 text-[10px] uppercase text-text-tertiary">
                  <th className="w-10 px-3 py-1.5" />
                  <th className="px-3 py-1.5 text-start">{tl('columnStudent')}</th>
                  <th className="px-3 py-1.5 text-start">{tl('columnStatus')}</th>
                  <th className="px-3 py-1.5 text-start">{tl('columnLocale')}</th>
                  <th className="px-3 py-1.5 text-start">{tl('columnGenerated')}</th>
                  <th className="px-3 py-1.5 text-end">{tl('columnActions')}</th>
                </tr>
              </thead>
              <tbody>{cls.report_cards.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderByRun = () => (
    <div className="space-y-4">
      {data.map((run) => {
        const runKey = run.batch_job_id ?? `legacy-${run.run_started_at}`;
        const isOpen = expanded.has(runKey);
        const runRowIds = run.classes.flatMap((c) => c.report_cards.map((r) => r.id));
        const allInSelection = runRowIds.every((id) => selected.has(id));
        return (
          <div key={runKey} className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <button
                type="button"
                onClick={() => toggleExpand(runKey)}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-secondary"
                aria-label={isOpen ? tl('collapseAria') : tl('expandAria')}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={allInSelection && runRowIds.length > 0}
                onChange={(e) => setSelectionBulk(runRowIds, e.target.checked)}
                aria-label={tl('selectRunAria')}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  {formatDateTime(run.run_started_at, locale)}
                  <span className="text-xs font-normal text-text-tertiary">
                    · {run.period_label}
                  </span>
                </div>
                <div className="text-xs text-text-tertiary">
                  {tl('runSummary', {
                    classes: run.classes.length,
                    docs: run.total_report_cards,
                    template: run.template_name ?? '—',
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void downloadBundle({
                      class_ids: run.classes
                        .map((c) => c.class_id)
                        .filter((id) => id !== '__unassigned'),
                      merge_mode: 'per_class',
                    })
                  }
                  title={tl('bundleRunPerClass')}
                >
                  <Package className="me-1.5 h-3.5 w-3.5" />
                  {tl('bundleRunPerClass')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void downloadBundle({
                      class_ids: run.classes
                        .map((c) => c.class_id)
                        .filter((id) => id !== '__unassigned'),
                      merge_mode: 'single',
                    })
                  }
                  title={tl('bundleRunSingle')}
                >
                  <Package className="me-1.5 h-3.5 w-3.5" />
                  {tl('bundleRunSingle')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => askDeleteRun(run)}
                  title={tl('deleteRun')}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            </div>
            {isOpen && (
              <div className="space-y-3 border-t border-border bg-surface-secondary/30 p-4">
                {run.classes.map((cls) => renderClassNode(cls, runKey))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderByYearGroup = () => {
    // Group all classes by year group across runs.
    const byYearGroup = new Map<string, { name: string; classes: GroupedClassNode[] }>();
    for (const run of data) {
      for (const cls of run.classes) {
        const key = cls.year_group?.id ?? '__unassigned';
        const name = cls.year_group?.name ?? tl('yearGroupUnassigned');
        const bucket = byYearGroup.get(key) ?? { name, classes: [] };
        // Merge duplicate classes across runs by id (class_id + run combined)
        bucket.classes.push(cls);
        byYearGroup.set(key, bucket);
      }
    }
    const entries = Array.from(byYearGroup.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    );
    if (entries.length === 0) return null;
    return (
      <div className="space-y-6">
        {entries.map(([ygId, bucket]) => (
          <div key={ygId} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                <GraduationCap className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold text-text-primary">{bucket.name}</h3>
              <div className="flex-1 border-t border-border/60" />
            </div>
            <div className="space-y-3">
              {bucket.classes
                .sort((a, b) => a.class_name.localeCompare(b.class_name))
                .map((cls) => renderClassNode(cls, ygId))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderByClass = () => {
    const flatClasses = data.flatMap((run) => run.classes);
    const sorted = flatClasses.sort((a, b) => a.class_name.localeCompare(b.class_name));
    return (
      <div className="space-y-3">
        {sorted.map((cls) =>
          renderClassNode(cls, `flat-${cls.class_id}-${cls.report_cards[0]?.id ?? 'x'}`),
        )}
      </div>
    );
  };

  const selectedCount = selected.size;

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title={tl('title')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/report-cards`)}>
            <ArrowLeft className="me-1.5 h-4 w-4" />
            {t('backToReportCards')}
          </Button>
        }
      />

      {/* View mode segmented control */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-xs font-semibold shadow-sm w-fit">
        {(['by_run', 'by_year_group', 'by_class'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              view === mode
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            {tl(`view_${mode}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : loadFailed ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{tl('loadFailed')}</p>
        </div>
      ) : allRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{tl('noDocuments')}</p>
        </div>
      ) : view === 'by_run' ? (
        renderByRun()
      ) : view === 'by_year_group' ? (
        renderByYearGroup()
      ) : (
        renderByClass()
      )}

      {/* Sticky selection action bar */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-xl ring-1 ring-primary-500/20">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {selectedCount}
            </span>
            <span className="text-sm font-medium text-text-primary">
              {tl('selectionCount', { count: selectedCount })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void downloadBundle({
                  report_card_ids: Array.from(selected),
                  merge_mode: 'single',
                })
              }
            >
              <Package className="me-1.5 h-3.5 w-3.5" />
              {tl('bundleSelection')}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePublishBulk}>
              <Send className="me-1.5 h-3.5 w-3.5" />
              {tl('publishSelection')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={askUnpublishSelection}
              className="text-amber-700 hover:bg-amber-50"
            >
              <Undo2 className="me-1.5 h-3.5 w-3.5" />
              {tl('unpublishSelection')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={askDeleteSelection}
              className="text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" />
              {tl('deleteSelection')}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {tl('clearSelection')}
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation modal — used for both delete and unpublish. */}
      {confirmAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary">
              {confirmAction.kind === 'delete'
                ? tl('confirmDeleteTitle')
                : tl('confirmUnpublishTitle')}
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmAction.kind === 'delete'
                ? tl('confirmDeleteBody', {
                    label: confirmAction.label,
                    count: confirmAction.ids.length,
                  })
                : tl('confirmUnpublishBody', {
                    label: confirmAction.label,
                    count: confirmAction.ids.length,
                  })}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                {tl('cancel')}
              </Button>
              {confirmAction.kind === 'delete' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  onClick={() => void executeDelete(confirmAction.ids)}
                >
                  <Trash2 className="me-1.5 h-3.5 w-3.5" />
                  {tl('confirmDeleteAction')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  onClick={() => void executeUnpublish(confirmAction.ids)}
                >
                  <Undo2 className="me-1.5 h-3.5 w-3.5" />
                  {tl('confirmUnpublishAction')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      calendar: 'gregory',
      numberingSystem: 'latn',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function extractFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? null;
}
