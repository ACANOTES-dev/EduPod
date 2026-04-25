'use client';

import {
  Calendar, ChevronLeft, Download, FileBarChart, FileSpreadsheet, FileText,
  Loader2, Save, Share2, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  QueryExecutionResult, SavedReportDraftDto, SavedReportQuery, SubjectDescriptor, UpsertSavedReportDraftDto,
} from '@school/shared/reports';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, toast,
} from '@school/ui';

import { apiClient, getAccessToken } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { ShareDialog, type ShareDialogReport } from '../_components/share-dialog';

import { BuilderEditor } from './_components/builder-editor';
import {
  DEFAULT_BUILDER_STATE, toSavedQuery, type BuilderState, type ReportSubjectKey, type SavedReportChartType,
} from './_components/builder-types';
import { PreviewPane } from './_components/preview-pane';
import { SaveDialog, type SaveDialogValues } from './_components/save-dialog';
import { SavedReportsSidebar, type SavedReportListItem } from './_components/saved-reports-sidebar';
import { ShareHistoryTab } from './_components/share-history-tab';
import { VisualizationToggle } from './_components/visualization-toggle';

interface SubjectRegistryResponse {
  data?: { subjects: SubjectDescriptor[] };
  subjects?: SubjectDescriptor[];
}

interface SavedReportRow {
  id: string;
  name: string;
  description: string | null;
  data_source: string;
  is_shared: boolean;
  visibility: 'private' | 'shared';
  is_favorite: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  dimensions_json: unknown;
  measures_json: unknown;
  filters_json: unknown;
  chart_type: SavedReportChartType | null;
}

interface SavedReportsListResponse {
  data: SavedReportRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface AiFlagRow { module_key: string; enabled: boolean; }

function toCreateBody(
  state: BuilderState,
  meta: { name: string; description: string; visibility: 'private' | 'shared' },
): Record<string, unknown> | null {
  const query = toSavedQuery(state);
  if (!query) return null;
  const legacyChartType = state.chartType === 'kpi' ? null : state.chartType;
  return {
    name: meta.name,
    data_source: state.subjectKey,
    dimensions_json: query.columns,
    measures_json: { sort: [], group_by: query.group_by ?? [] },
    filters_json: query.filters ?? { combinator: 'and', filters: [] },
    chart_type: legacyChartType,
    is_shared: meta.visibility === 'shared',
    description: meta.description || undefined,
  };
}

export default function ReportBuilderPage() {
  const t = useTranslations('reports.builder.page');
  const tActions = useTranslations('reports.builder.actions');
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const reportId = params?.id ?? null;
  const { user } = useAuth();

  const [subjects, setSubjects] = React.useState<SubjectDescriptor[]>([]);
  const [savedReports, setSavedReports] = React.useState<SavedReportListItem[]>([]);
  const [reportsLoading, setReportsLoading] = React.useState(true);
  const [askAiEnabled, setAskAiEnabled] = React.useState(false);
  const [activeReport, setActiveReport] = React.useState<SavedReportRow | null>(null);
  const [state, setState] = React.useState<BuilderState>(DEFAULT_BUILDER_STATE);
  const [previewResult, setPreviewResult] = React.useState<QueryExecutionResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [draftRestoredOnce, setDraftRestoredOnce] = React.useState(false);
  const [askAiRationale, setAskAiRationale] = React.useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState<null | 'pdf' | 'excel' | 'word'>(null);
  const [deleting, setDeleting] = React.useState(false);
  // Impl 19 — share dialog + share history tab.
  const [shareDialogReport, setShareDialogReport] = React.useState<ShareDialogReport | null>(null);
  const [activeTab, setActiveTab] = React.useState<'editor' | 'shareHistory'>('editor');
  const [shareHistoryRefreshKey, setShareHistoryRefreshKey] = React.useState(0);

  const activeSubject = React.useMemo(
    () => subjects.find((s) => s.key === state.subjectKey) ?? null,
    [subjects, state.subjectKey],
  );

  React.useEffect(() => {
    void loadSubjects();
    void loadSavedReports();
    void loadAiFlags();
  }, []);

  React.useEffect(() => {
    if (reportId) void loadSavedReport(reportId);
    else if (!draftRestoredOnce) void loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function loadSubjects() {
    try {
      const res = await apiClient<SubjectRegistryResponse>('/api/v1/reports/subject-registry');
      setSubjects(res.data?.subjects ?? res.subjects ?? []);
    } catch (err) { console.error('[ReportBuilder] loadSubjects', err); }
  }

  async function loadSavedReports() {
    setReportsLoading(true);
    try {
      const res = await apiClient<SavedReportsListResponse>('/api/v1/reports/builder?page=1&pageSize=100');
      const items = (res.data ?? []).map<SavedReportListItem>((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        data_source: r.data_source,
        is_shared: r.is_shared,
        visibility: r.visibility ?? (r.is_shared ? 'shared' : 'private'),
        is_favorite: r.is_favorite ?? false,
        created_by_user_id: r.created_by_user_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      setSavedReports(items);
    } catch (err) { console.error('[ReportBuilder] loadSavedReports', err); }
    finally { setReportsLoading(false); }
  }

  async function loadAiFlags() {
    try {
      const res = await apiClient<{ data?: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', { silent: true });
      const rows = Array.isArray(res) ? res : (res.data ?? []);
      const flag = rows.find((r) => r.module_key === 'reports_ask_ai');
      setAskAiEnabled(flag?.enabled === true);
    } catch (err) {
      console.error('[ReportBuilder] loadAiFlags', err);
      setAskAiEnabled(false);
    }
  }

  async function loadDraft() {
    try {
      // Backend returns `undefined` (204 No Content) when there's no draft, and the
      // draft object otherwise. The ResponseTransformInterceptor may wrap a 200 body
      // in `{ data }`, so accept either shape — and treat any missing-field draft
      // as "no draft" rather than crashing the builder on initial mount.
      const raw = await apiClient<SavedReportDraftDto | { data?: SavedReportDraftDto } | undefined>(
        '/api/v1/reports/builder/draft',
        { silent: true },
      );
      setDraftRestoredOnce(true);
      const draft: SavedReportDraftDto | undefined =
        raw && typeof raw === 'object' && 'data' in raw
          ? (raw as { data?: SavedReportDraftDto }).data
          : (raw as SavedReportDraftDto | undefined);
      // Guard every field — older drafts (or partial / corrupted persistence) may
      // omit `columns_json`, causing `Cannot read properties of undefined`.
      if (!draft || !draft.subject_key || !draft.columns_json?.field_ids) return;
      const next: BuilderState = {
        subjectKey: draft.subject_key,
        selectedFieldIds: draft.columns_json.field_ids,
        columnAggregations: Object.fromEntries(
          (draft.group_by_json?.measures ?? []).map((m) => [m.field_id, m.aggregation]),
        ),
        filters: (draft.filters_json ?? []) as BuilderState['filters'],
        groupByFieldId: draft.group_by_json?.field_id ?? null,
        chartType: draft.chart_type ?? 'table',
        chartConfig: (draft.chart_config_json ?? {}) as BuilderState['chartConfig'],
      };
      setState(next);
      toast.success(t('draftRestored'));
    } catch (err) { console.error('[ReportBuilder] loadDraft', err); }
  }

  async function loadSavedReport(id: string) {
    try {
      const row = await apiClient<SavedReportRow>(`/api/v1/reports/builder/${id}`);
      setActiveReport(row);
      setState(restoreSavedReport(row));
    } catch (err) {
      console.error('[ReportBuilder] loadSavedReport', err);
      toast.error('Could not load that report.');
      router.push('/reports/builder');
    }
  }

  React.useEffect(() => {
    if (!draftRestoredOnce && !reportId) return;
    if (state.subjectKey === null) return;
    const handle = setTimeout(() => { void saveDraft(state); }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, draftRestoredOnce, reportId]);

  async function saveDraft(s: BuilderState) {
    if (!s.subjectKey || s.selectedFieldIds.length === 0) return;
    // The SavedReportDraftFilterGroup schema's operator enum overlaps with
    // but is not identical to the QueryEngine's FilterGroup operator enum
    // (e.g. `greater_or_equal` vs `greater_than_or_equal`). The backend's
    // draft service accepts the QueryEngine shape via the lenient lazy
    // schema, so we cast through the JSON-compatible
    // `UpsertSavedReportDraftDto['filters_json']` shape rather than
    // hand-translating every operator.
    const body: UpsertSavedReportDraftDto = {
      subject_key: s.subjectKey,
      columns_json: { field_ids: s.selectedFieldIds },
      filters_json: s.filters as unknown as UpsertSavedReportDraftDto['filters_json'],
      group_by_json: s.groupByFieldId
        ? {
            field_id: s.groupByFieldId,
            measures: Object.entries(s.columnAggregations).map(([field_id, aggregation]) => ({ field_id, aggregation })),
          }
        : null,
      chart_type: s.chartType,
      chart_config_json: s.chartConfig,
    };
    try {
      await apiClient('/api/v1/reports/builder/draft', { method: 'PUT', body: JSON.stringify(body), silent: true });
    } catch (err) { console.error('[ReportBuilder] saveDraft', err); }
  }

  async function clearDraft() {
    try { await apiClient('/api/v1/reports/builder/draft', { method: 'DELETE', silent: true }); }
    catch (err) { console.error('[ReportBuilder] clearDraft', err); }
  }

  React.useEffect(() => {
    const query = toSavedQuery(state);
    if (!query) { setPreviewResult(null); setPreviewError(null); return; }
    setPreviewLoading(true);
    const handle = setTimeout(() => { void runPreview(query); }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.subjectKey, state.selectedFieldIds.join(','), JSON.stringify(state.filters), state.groupByFieldId]);

  async function runPreview(query: SavedReportQuery) {
    setPreviewError(null);
    try {
      const res = await apiClient<{ data: QueryExecutionResult } | QueryExecutionResult>(
        '/api/v1/reports/builder/preview',
        { method: 'POST', body: JSON.stringify({ query }), silent: true },
      );
      const result = (res as { data?: QueryExecutionResult }).data ?? (res as QueryExecutionResult);
      setPreviewResult(result);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      setPreviewResult(null);
      if (apiErr?.code === 'REPORT_QUERY_TIMEOUT') setPreviewError('Query timed out. Narrow your filters and try again.');
      else if (apiErr?.code === 'REPORT_ROW_CAP_EXCEEDED') setPreviewError('This query returns too many rows. Narrow your filters or save and export.');
      else setPreviewError(apiErr?.message ?? 'Preview failed.');
      console.error('[ReportBuilder] runPreview', err);
    } finally { setPreviewLoading(false); }
  }

  async function onSave(values: SaveDialogValues): Promise<null | 'NAME_TAKEN' | 'GENERIC'> {
    const body = toCreateBody(state, { name: values.name, description: values.description ?? '', visibility: values.visibility });
    if (!body) return 'GENERIC';
    body.is_favorite = values.is_favorite;
    try {
      const url = reportId ? `/api/v1/reports/builder/${reportId}` : '/api/v1/reports/builder';
      const method = reportId ? 'PUT' : 'POST';
      const res = await apiClient<{ data?: SavedReportRow } | SavedReportRow>(url, { method, body: JSON.stringify(body), silent: true });
      const saved = (res as { data?: SavedReportRow }).data ?? (res as SavedReportRow);
      toast.success(`${values.name} saved`);
      await clearDraft();
      await loadSavedReports();
      if (!reportId) router.push(`/reports/builder/${saved.id}`);
      else setActiveReport(saved);
      return null;
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr?.code === 'SAVED_REPORT_NAME_TAKEN') return 'NAME_TAKEN';
      console.error('[ReportBuilder] onSave', err);
      return 'GENERIC';
    }
  }

  async function onDeleteCurrent() {
    if (!reportId) return;
    if (!confirm(tActions('confirmDelete'))) return;
    setDeleting(true);
    try {
      await apiClient(`/api/v1/reports/builder/${reportId}`, { method: 'DELETE' });
      toast.success(`Report deleted`);
      await loadSavedReports();
      router.push('/reports/builder');
    } catch (err) {
      console.error('[ReportBuilder] onDeleteCurrent', err);
      toast.error('Could not delete the report.');
    } finally { setDeleting(false); }
  }

  async function onDeleteFromSidebar(report: SavedReportListItem) {
    if (!confirm(tActions('confirmDelete'))) return;
    try {
      await apiClient(`/api/v1/reports/builder/${report.id}`, { method: 'DELETE' });
      await loadSavedReports();
      if (reportId === report.id) router.push('/reports/builder');
    } catch (err) {
      console.error('[ReportBuilder] onDeleteFromSidebar', err);
      toast.error('Could not delete the report.');
    }
  }

  // ─── Impl 19 — sidebar action handlers ───────────────────────────────────

  async function onDuplicateFromSidebar(report: SavedReportListItem) {
    try {
      const res = await apiClient<SavedReportRow | { data: SavedReportRow }>(
        `/api/v1/reports/builder/${report.id}/duplicate`,
        { method: 'POST', silent: true },
      );
      const created = (res as { data?: SavedReportRow }).data ?? (res as SavedReportRow);
      toast.success(tActions('duplicateSuccess', { name: created.name }));
      await loadSavedReports();
      router.push(`/reports/builder/${created.id}`);
    } catch (err) {
      console.error('[ReportBuilder] onDuplicateFromSidebar', err);
      const apiErr = err as { code?: string; message?: string };
      toast.error(apiErr?.message ?? tActions('duplicateFailed'));
    }
  }

  async function onShareFromSidebar(report: SavedReportListItem) {
    setShareDialogReport({ id: report.id, name: report.name });
  }

  function onShareCurrent() {
    if (!reportId) return;
    setShareDialogReport({ id: reportId, name: activeReport?.name ?? t('untitled') });
  }

  async function onRenameFromSidebar(
    report: SavedReportListItem,
    newName: string,
  ): Promise<boolean> {
    try {
      await apiClient(`/api/v1/reports/builder/${report.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName }),
        silent: true,
      });
      toast.success(tActions('renameSuccess'));
      await loadSavedReports();
      if (reportId === report.id) {
        // Update the current header title without a router refetch.
        setActiveReport((cur) => (cur ? { ...cur, name: newName } : cur));
      }
      return true;
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      console.error('[ReportBuilder] onRenameFromSidebar', err);
      if (apiErr?.code === 'SAVED_REPORT_NAME_TAKEN') {
        toast.error(tActions('renameNameTaken'));
      } else {
        toast.error(apiErr?.message ?? tActions('renameFailed'));
      }
      return false;
    }
  }

  async function onToggleFavoriteFromSidebar(report: SavedReportListItem): Promise<void> {
    const next = !report.is_favorite;
    // Optimistic — flip locally before the network round-trip so the UI feels
    // instant. On failure we revert and surface the error.
    setSavedReports((prev) =>
      prev.map((r) => (r.id === report.id ? { ...r, is_favorite: next } : r)),
    );
    try {
      await apiClient(`/api/v1/reports/builder/${report.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_favorite: next }),
        silent: true,
      });
    } catch (err) {
      console.error('[ReportBuilder] onToggleFavorite', err);
      setSavedReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, is_favorite: report.is_favorite } : r)),
      );
      toast.error(tActions('favoriteFailed'));
    }
  }

  async function onExport(format: 'pdf' | 'excel' | 'word') {
    if (!reportId) { toast.error('Save the report first.'); return; }
    setExporting(format);
    try {
      const token = getAccessToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiUrl}/api/v1/reports/builder/${reportId}/export`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const filenameMatch = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/);
      const filename = filenameMatch?.[1] ?? `report.${format === 'word' ? 'docx' : format === 'excel' ? 'xlsx' : 'pdf'}`;
      downloadBlob(blob, filename);
      toast.success(tActions('exportComplete'));
    } catch (err) {
      console.error('[ReportBuilder] onExport', err);
      toast.error(tActions('exportFailed'));
    } finally { setExporting(null); }
  }

  function newReport() {
    setState(DEFAULT_BUILDER_STATE);
    setPreviewResult(null);
    setActiveReport(null);
    setAskAiRationale(null);
    if (reportId) router.push('/reports/builder');
  }

  const reportTitle = activeReport?.name ?? t('untitled');

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/reports" className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-secondary" aria-label="Back to reports">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs text-text-tertiary">{t('title')}</p>
            <h1 className="truncate text-lg font-semibold text-text-primary">{reportTitle}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VisualizationToggle value={state.chartType} onChange={(chartType) => setState((s) => ({ ...s, chartType }))} />
          {reportId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting !== null}>
                  {exporting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}
                  {tActions('export')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExport('pdf')}><FileText className="me-2 h-4 w-4" /> {tActions('exportPdf')}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('excel')}><FileSpreadsheet className="me-2 h-4 w-4" /> {tActions('exportExcel')}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('word')}><FileBarChart className="me-2 h-4 w-4" /> {tActions('exportWord')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {reportId && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShareCurrent}
              data-testid="share-current"
            >
              <Share2 className="me-2 h-4 w-4" />
              {tActions('share')}
            </Button>
          )}
          {reportId && (<Button variant="outline" size="sm" disabled title="Wired in impl 17"><Calendar className="me-2 h-4 w-4" />{tActions('schedule')}</Button>)}
          {reportId && (
            <Button variant="outline" size="sm" onClick={onDeleteCurrent} disabled={deleting} data-testid="delete-button">
              {deleting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Trash2 className="me-2 h-4 w-4" />}{tActions('delete')}
            </Button>
          )}
          <Button size="sm" onClick={() => setSaveDialogOpen(true)} disabled={!toSavedQuery(state)} data-testid="save-button">
            <Save className="me-2 h-4 w-4" />{tActions('save')}
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden pt-3 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-xl border border-border bg-surface p-3 lg:overflow-hidden">
          <div className="mb-2">
            <Button type="button" size="sm" variant="outline" onClick={newReport} className="w-full" data-testid="new-report-button">
              {t('newReport')}
            </Button>
          </div>
          <SavedReportsSidebar
            currentUserId={user?.id ?? null}
            reports={savedReports}
            loading={reportsLoading}
            currentReportId={reportId}
            onSelect={(id) => router.push(`/reports/builder/${id}`)}
            onDelete={onDeleteFromSidebar}
            onDuplicate={onDuplicateFromSidebar}
            onShare={onShareFromSidebar}
            onRename={onRenameFromSidebar}
            onToggleFavorite={onToggleFavoriteFromSidebar}
          />
        </div>

        <div className="overflow-y-auto rounded-xl border border-border bg-surface p-4">
          {reportId && activeReport && activeReport.created_by_user_id === user?.id ? (
            <div className="mb-3 flex gap-2 border-b border-border pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'editor'
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface-secondary'
                }`}
                data-testid="tab-editor"
              >
                {t('tabs.editor')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shareHistory')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  activeTab === 'shareHistory'
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface-secondary'
                }`}
                data-testid="tab-share-history"
              >
                {t('tabs.shareHistory')}
              </button>
            </div>
          ) : null}

          {activeTab === 'editor' || !reportId ? (
            <BuilderEditor
              subjects={subjects}
              activeSubject={activeSubject}
              state={state}
              onChange={setState}
              askAiEnabled={askAiEnabled}
              rationale={askAiRationale}
              onAskAiTranslated={(_q, rationale) => setAskAiRationale(rationale)}
              onAskAiDiscard={() => setAskAiRationale(null)}
            />
          ) : (
            <ShareHistoryTab reportId={reportId ?? ''} refreshKey={shareHistoryRefreshKey} />
          )}
        </div>

        <div className="overflow-y-auto rounded-xl border border-border bg-surface p-4">
          <PreviewPane
            loading={previewLoading}
            error={previewError}
            result={previewResult}
            chartType={state.chartType}
            chartConfig={state.chartConfig}
            onChartConfigChange={(chartConfig) => setState((s) => ({ ...s, chartConfig }))}
            subject={activeSubject}
          />
        </div>
      </div>

      <SaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        initial={{
          name: activeReport?.name ?? '',
          description: '',
          visibility: activeReport?.is_shared ? 'shared' : 'private',
          is_favorite: false,
        }}
        onSave={onSave}
      />

      <ShareDialog
        open={shareDialogReport !== null}
        onOpenChange={(open) => !open && setShareDialogReport(null)}
        report={shareDialogReport}
        onSuccess={() => {
          setShareHistoryRefreshKey((k) => k + 1);
          if (reportId === shareDialogReport?.id) setActiveTab('shareHistory');
        }}
      />
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function restoreSavedReport(row: SavedReportRow): BuilderState {
  const subjectKey = (row.data_source && typeof row.data_source === 'string' ? row.data_source : 'student') as ReportSubjectKey;
  const fieldIds: string[] = Array.isArray(row.dimensions_json)
    ? (row.dimensions_json as Array<string | { field_id: string }>).map((c) => (typeof c === 'string' ? c : c.field_id))
    : [];
  const measures = row.measures_json as { group_by?: Array<{ field_id: string }> } | unknown;
  const groupByFieldId = measures && typeof measures === 'object' && 'group_by' in measures
    ? (measures as { group_by?: Array<{ field_id: string }> }).group_by?.[0]?.field_id ?? null
    : null;
  const filters = row.filters_json as BuilderState['filters'];
  const safeFilters: BuilderState['filters'] = filters && typeof filters === 'object' && 'combinator' in filters
    ? filters
    : { combinator: 'and', filters: [] };
  return {
    subjectKey,
    selectedFieldIds: fieldIds,
    columnAggregations: {},
    filters: safeFilters,
    groupByFieldId,
    chartType: (row.chart_type ?? 'table') as SavedReportChartType,
    chartConfig: {},
  };
}
