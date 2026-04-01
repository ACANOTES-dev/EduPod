'use client';

import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

type TrendDirection = 'improving' | 'declining' | 'stable';

interface ProgressReportEntry {
  subject_id: string;
  subject_name: string;
  current_average: number | null;
  trend: TrendDirection;
  teacher_note: string;
}

interface DraftReport {
  student_id: string;
  student_name: string;
  student_number: string | null;
  entries: ProgressReportEntry[];
}

interface HistoryReport {
  id: string;
  student_name: string;
  class_name: string;
  period_name: string;
  status: 'draft' | 'sent';
  generated_at: string;
  sent_at: string | null;
}

interface HistoryResponse {
  data: HistoryReport[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Trend Indicator ──────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: TrendDirection }) {
  if (trend === 'improving') {
    return <span className="text-success-600 font-semibold text-sm">↑</span>;
  }
  if (trend === 'declining') {
    return <span className="text-danger-600 font-semibold text-sm">↓</span>;
  }
  return <span className="text-text-tertiary text-sm">→</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgressReportsPage() {
  const t = useTranslations('gradebook');

  const [activeTab, setActiveTab] = React.useState<'generate' | 'history'>('generate');

  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [classes, setClasses] = React.useState<SelectOption[]>([]);

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch(() => undefined);
  }, []);

  const tabs = [
    { key: 'generate' as const, label: t('progressReportsGenerate') },
    { key: 'history' as const, label: t('progressReportsHistory') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('progressReportsTitle')} description={t('progressReportsDescription')} />

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-border" aria-label="Progress reports tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab.key
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'generate' && <GenerateTab periods={periods} classes={classes} t={t} />}

      {activeTab === 'history' && <HistoryTab periods={periods} classes={classes} t={t} />}
    </div>
  );
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────

interface TabProps {
  periods: SelectOption[];
  classes: SelectOption[];
  t: ReturnType<typeof useTranslations<'gradebook'>>;
}

function GenerateTab({ periods, classes, t }: TabProps) {
  const tc = useTranslations('common');

  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedPeriod, setSelectedPeriod] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  const [drafts, setDrafts] = React.useState<DraftReport[]>([]);
  const [notes, setNotes] = React.useState<Record<string, Record<string, string>>>({});

  const canGenerate = selectedClass && selectedPeriod;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await apiClient<{ data: DraftReport[] }>(
        `/api/v1/gradebook/progress-reports/draft?class_id=${selectedClass}&academic_period_id=${selectedPeriod}`,
      );
      setDrafts(res.data);
      // Initialise notes from existing data
      const noteMap: Record<string, Record<string, string>> = {};
      for (const d of res.data) {
        const subjectNotes: Record<string, string> = {};
        for (const e of d.entries) {
          subjectNotes[e.subject_id] = e.teacher_note ?? '';
        }
        noteMap[d.student_id] = subjectNotes;
      }
      setNotes(noteMap);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSendToParents = async () => {
    if (!canGenerate || drafts.length === 0) return;
    setSending(true);
    try {
      // Merge notes back into entries
      const payload = drafts.map((d) => ({
        student_id: d.student_id,
        entries: d.entries.map((e) => ({
          subject_id: e.subject_id,
          teacher_note: notes[d.student_id]?.[e.subject_id] ?? '',
        })),
      }));
      await apiClient('/api/v1/gradebook/progress-reports/send', {
        method: 'POST',
        body: JSON.stringify({
          class_id: selectedClass,
          academic_period_id: selectedPeriod,
          reports: payload,
        }),
      });
      toast.success(t('progressReportsSentSuccess'));
      setDrafts([]);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSending(false);
    }
  };

  const updateNote = (studentId: string, subjectId: string, value: string) => {
    setNotes((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {}),
        [subjectId]: value,
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Selection controls */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('progressReportsSelectPrompt')}
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-1.5">
            <Label>{t('selectClass')}</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectClass')} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>{t('selectPeriod')}</Label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectPeriod')} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleGenerate} disabled={!canGenerate || generating}>
            {generating ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t('progressReportsGenerating')}
              </>
            ) : (
              t('progressReportsGenerateBtn')
            )}
          </Button>
          {drafts.length > 0 && (
            <Button variant="outline" onClick={handleSendToParents} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('progressReportsSending')}
                </>
              ) : (
                <>
                  <Send className="me-2 h-4 w-4" />
                  {t('progressReportsSendToParents')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Draft previews */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('progressReportsDraftCount', { count: drafts.length })}
          </h3>
          {drafts.map((draft) => (
            <div
              key={draft.student_id}
              className="rounded-xl border border-border bg-surface overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border bg-surface-secondary px-4 py-3">
                <div>
                  <span className="text-sm font-semibold text-text-primary">
                    {draft.student_name}
                  </span>
                  {draft.student_number && (
                    <span className="ms-2 text-xs text-text-tertiary font-mono" dir="ltr">
                      {draft.student_number}
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border">
                {draft.entries.map((entry) => (
                  <div key={entry.subject_id} className="px-4 py-3 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {entry.subject_name}
                        </span>
                        <TrendBadge trend={entry.trend} />
                      </div>
                      {entry.current_average !== null && (
                        <span
                          className="text-sm font-semibold text-text-primary font-mono"
                          dir="ltr"
                        >
                          {entry.current_average.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <Textarea
                      placeholder={t('progressReportsNoteHint')}
                      value={notes[draft.student_id]?.[entry.subject_id] ?? ''}
                      onChange={(e) =>
                        updateNote(draft.student_id, entry.subject_id, e.target.value)
                      }
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ periods, classes, t }: TabProps) {
  const tc = useTranslations('common');
  const [classFilter, setClassFilter] = React.useState('all');
  const [periodFilter, setPeriodFilter] = React.useState('all');
  const [rows, setRows] = React.useState<HistoryReport[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchHistory = React.useCallback(async (p: number, classId: string, periodId: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (classId !== 'all') params.set('class_id', classId);
      if (periodId !== 'all') params.set('academic_period_id', periodId);
      const res = await apiClient<HistoryResponse>(
        `/api/v1/gradebook/progress-reports?${params.toString()}`,
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchHistory(page, classFilter, periodFilter);
  }, [page, classFilter, periodFilter, fetchHistory]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={classFilter}
          onValueChange={(v) => {
            setClassFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectClass')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allClasses')}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={periodFilter}
          onValueChange={(v) => {
            setPeriodFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allPeriods')}</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                {[
                  t('student'),
                  t('publishingClass'),
                  t('period'),
                  t('progressReportsGeneratedAt'),
                  t('progressReportsSentAt'),
                  tc('status'),
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    {h}
                  </th>
                ))}
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
                    {t('progressReportsNoHistory')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.student_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.class_name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.period_name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono" dir="ltr">
                      {new Date(row.generated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono" dir="ltr">
                      {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'sent' ? (
                        <StatusBadge status="success">{t('progressReportsSent')}</StatusBadge>
                      ) : (
                        <StatusBadge status="neutral">{t('progressReportsDraft')}</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-text-secondary">
          <span>{total === 0 ? t('progressReportsNoHistory') : `${total}`}</span>
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
