'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';
import { CheckCircle2, Circle, Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type BulkStep = 'generate' | 'review' | 'approve' | 'notify';

interface AcademicPeriod {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  name: string;
}

interface BulkStatusRow {
  student_id: string;
  student_name: string;
  report_card_id: string | null;
  status: string | null;
  teacher_comment_filled: boolean;
  principal_comment_filled: boolean;
  custom_fields_filled: boolean;
  approval_status: string | null;
  acknowledged: boolean;
}

interface BulkStatusResponse {
  data: BulkStatusRow[];
  meta: { total: number; generated: number; published: number; pending_approval: number };
}

interface ListResponse<T> {
  data: T[];
}

const STEPS: BulkStep[] = ['generate', 'review', 'approve', 'notify'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BulkOperationsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [currentStep, setCurrentStep] = React.useState<BulkStep>('generate');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedPeriod, setSelectedPeriod] = React.useState('');

  const [generating, setGenerating] = React.useState(false);
  const [statusData, setStatusData] = React.useState<BulkStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [actioning, setActioning] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
      apiClient<ListResponse<SchoolClass>>('/api/v1/classes?pageSize=100'),
    ])
      .then(([periodsRes, classesRes]) => {
        setPeriods(periodsRes.data);
        setClasses(classesRes.data);
      })
      .catch(() => undefined);
  }, []);

  const fetchStatus = React.useCallback(async (classId: string, periodId: string) => {
    setLoadingStatus(true);
    try {
      const params = new URLSearchParams({ class_id: classId, academic_period_id: periodId });
      const res = await apiClient<BulkStatusResponse>(
        `/api/v1/report-cards/bulk-status?${params.toString()}`,
      );
      setStatusData(res);
    } catch {
      setStatusData(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const handleGenerate = async () => {
    if (!selectedClass || !selectedPeriod) {
      toast.error(t('selectClassAndPeriod'));
      return;
    }
    setGenerating(true);
    try {
      await apiClient('/api/v1/report-cards/generate-batch-async', {
        method: 'POST',
        body: JSON.stringify({
          class_id: selectedClass,
          academic_period_id: selectedPeriod,
        }),
      });
      toast.success(t('bulkGenerateStarted'));
      setCurrentStep('review');
      void fetchStatus(selectedClass, selectedPeriod);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitForApproval = async () => {
    const ids = selectedRows.size > 0
      ? Array.from(selectedRows)
      : statusData?.data.filter((r) => r.report_card_id).map((r) => r.report_card_id!) ?? [];

    if (ids.length === 0) return;
    setActioning(true);
    try {
      await apiClient('/api/v1/report-cards/bulk-submit-approval', {
        method: 'POST',
        body: JSON.stringify({ report_card_ids: ids }),
      });
      toast.success(t('bulkSubmittedForApproval'));
      setCurrentStep('approve');
      void fetchStatus(selectedClass, selectedPeriod);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setActioning(false);
    }
  };

  const handlePublishAll = async () => {
    const ids = selectedRows.size > 0
      ? Array.from(selectedRows)
      : statusData?.data.filter((r) => r.report_card_id).map((r) => r.report_card_id!) ?? [];

    if (ids.length === 0) return;
    setActioning(true);
    try {
      await apiClient('/api/v1/report-cards/bulk-publish', {
        method: 'POST',
        body: JSON.stringify({ report_card_ids: ids }),
      });
      toast.success(t('bulkPublished'));
      setCurrentStep('notify');
      void fetchStatus(selectedClass, selectedPeriod);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setActioning(false);
    }
  };

  const handleNotifyAll = async () => {
    const ids = selectedRows.size > 0
      ? Array.from(selectedRows)
      : statusData?.data.filter((r) => r.status === 'published').map((r) => r.report_card_id!) ?? [];

    if (ids.length === 0) return;
    setActioning(true);
    try {
      await apiClient('/api/v1/report-cards/bulk-notify', {
        method: 'POST',
        body: JSON.stringify({ report_card_ids: ids }),
      });
      toast.success(t('bulkNotified'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setActioning(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = statusData?.data.filter((r) => r.report_card_id).map((r) => r.report_card_id!) ?? [];
    if (selectedRows.size === ids.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(ids));
    }
  };

  const stepIdx = STEPS.indexOf(currentStep);

  return (
    <div className="space-y-6">
      <PageHeader title={t('bulkOperations')} />

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-0">
        {STEPS.map((step, idx) => {
          const done = idx < stepIdx;
          const active = idx === stepIdx;
          return (
            <React.Fragment key={step}>
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? 'bg-success-100 text-success-700'
                      : active
                      ? 'bg-primary-700 text-white'
                      : 'bg-surface-secondary text-text-tertiary'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                <span
                  className={`text-sm font-medium ${
                    active ? 'text-text-primary' : done ? 'text-success-700' : 'text-text-tertiary'
                  }`}
                >
                  {t(`bulkStep_${step}`)}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="mx-2 hidden h-px w-8 bg-border sm:block" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      {currentStep === 'generate' && (
        <GenerateStep
          periods={periods}
          classes={classes}
          selectedClass={selectedClass}
          selectedPeriod={selectedPeriod}
          onClassChange={setSelectedClass}
          onPeriodChange={setSelectedPeriod}
          onGenerate={() => void handleGenerate()}
          generating={generating}
          t={t}
          tc={tc}
        />
      )}

      {(currentStep === 'review' || currentStep === 'approve' || currentStep === 'notify') && (
        <ReviewStep
          statusData={statusData}
          loading={loadingStatus}
          selectedRows={selectedRows}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          currentStep={currentStep}
          onSubmitForApproval={() => void handleSubmitForApproval()}
          onPublishAll={() => void handlePublishAll()}
          onNotifyAll={() => void handleNotifyAll()}
          onRefresh={() => void fetchStatus(selectedClass, selectedPeriod)}
          actioning={actioning}
          t={t}
          tc={tc}
        />
      )}
    </div>
  );
}

// ─── Generate Step ────────────────────────────────────────────────────────────

interface GenerateStepProps {
  periods: AcademicPeriod[];
  classes: SchoolClass[];
  selectedClass: string;
  selectedPeriod: string;
  onClassChange: (v: string) => void;
  onPeriodChange: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  t: ReturnType<typeof useTranslations<'reportCards'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}

function GenerateStep({
  periods,
  classes,
  selectedClass,
  selectedPeriod,
  onClassChange,
  onPeriodChange,
  onGenerate,
  generating,
  t,
}: GenerateStepProps) {
  return (
    <div className="max-w-lg rounded-2xl border border-border bg-surface p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-text-primary">{t('bulkStep_generate')}</h3>
        <p className="mt-1 text-sm text-text-secondary">{t('bulkGenerateDesc')}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-primary">{t('selectClass')}</label>
          <Select value={selectedClass} onValueChange={onClassChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectClass')} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-primary">{t('selectPeriod')}</label>
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectPeriod')} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={onGenerate}
        disabled={generating || !selectedClass || !selectedPeriod}
        className="w-full"
      >
        {generating ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {t('generating')}
          </>
        ) : (
          t('generateAllDrafts')
        )}
      </Button>
    </div>
  );
}

// ─── Review Step ─────────────────────────────────────────────────────────────

interface ReviewStepProps {
  statusData: BulkStatusResponse | null;
  loading: boolean;
  selectedRows: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  currentStep: BulkStep;
  onSubmitForApproval: () => void;
  onPublishAll: () => void;
  onNotifyAll: () => void;
  onRefresh: () => void;
  actioning: boolean;
  t: ReturnType<typeof useTranslations<'reportCards'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}

function ReviewStep({
  statusData,
  loading,
  selectedRows,
  onToggleRow,
  onToggleAll,
  currentStep,
  onSubmitForApproval,
  onPublishAll,
  onNotifyAll,
  onRefresh,
  actioning,
  t,
  tc,
}: ReviewStepProps) {
  const rows = statusData?.data ?? [];
  const meta = statusData?.meta;
  const allIds = rows.filter((r) => r.report_card_id).map((r) => r.report_card_id!);
  const allSelected = allIds.length > 0 && selectedRows.size === allIds.length;

  return (
    <div className="space-y-4">
      {/* Progress cards */}
      {meta && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label={t('total')} value={meta.total} />
          <MetricCard label={t('generated')} value={meta.generated} />
          <MetricCard label={t('published')} value={meta.published} variant="success" />
          <MetricCard label={t('pendingApproval')} value={meta.pending_approval} variant="warning" />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
          {tc('refresh')}
        </Button>
        {currentStep === 'review' && (
          <>
            <Button size="sm" variant="outline" onClick={onSubmitForApproval} disabled={actioning}>
              {actioning ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
              {t('submitAllForApproval')}
            </Button>
            <Button size="sm" onClick={onPublishAll} disabled={actioning}>
              {actioning ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
              {t('publishAll')}
            </Button>
          </>
        )}
        {currentStep === 'approve' && (
          <Button size="sm" onClick={onPublishAll} disabled={actioning}>
            {actioning ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
            {t('publishAll')}
          </Button>
        )}
        {currentStep === 'notify' && (
          <Button size="sm" onClick={onNotifyAll} disabled={actioning}>
            {actioning ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
            <Send className="me-2 h-3.5 w-3.5" />
            {t('notifyAllParents')}
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-tertiary">{tc('noResults')}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="w-10 px-4 py-3 text-start">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-border"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                  {t('student')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                  {t('status')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary hidden sm:table-cell">
                  {t('comments')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary hidden md:table-cell">
                  {t('customFields')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary hidden lg:table-cell">
                  {t('acknowledged')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.student_id} className="hover:bg-surface-secondary/50">
                  <td className="px-4 py-3">
                    {row.report_card_id && (
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.report_card_id)}
                        onChange={() => onToggleRow(row.report_card_id!)}
                        className="rounded border-border"
                        aria-label={`Select ${row.student_name}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-text-primary">{row.student_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status ? (
                      <StatusBadge
                        status={
                          row.status === 'published'
                            ? 'success'
                            : row.status === 'draft'
                            ? 'warning'
                            : 'neutral'
                        }
                        dot
                      >
                        {t(`status${row.status.charAt(0).toUpperCase() + row.status.slice(1)}` as 'statusDraft' | 'statusPublished' | 'statusRevised')}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-text-tertiary">{t('notGenerated')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <FillIndicator filled={row.teacher_comment_filled} label="T" />
                      <FillIndicator filled={row.principal_comment_filled} label="P" />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <FillIndicator filled={row.custom_fields_filled} label={row.custom_fields_filled ? '✓' : '○'} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {row.acknowledged ? (
                      <CheckCircle2 className="h-4 w-4 text-success-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-text-tertiary" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  variant?: 'neutral' | 'success' | 'warning';
}) {
  const colorMap = {
    neutral: 'text-text-primary',
    success: 'text-success-700',
    warning: 'text-warning-700',
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[variant]}`}>{value}</p>
    </div>
  );
}

function FillIndicator({ filled, label }: { filled: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
        filled ? 'bg-success-100 text-success-700' : 'bg-surface-secondary text-text-tertiary'
      }`}
    >
      {label}
    </span>
  );
}
