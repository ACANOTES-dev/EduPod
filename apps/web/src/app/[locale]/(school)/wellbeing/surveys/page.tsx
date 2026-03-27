'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
  Textarea,
} from '@school/ui';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardList,
  Copy,
  Edit2,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived';
type QuestionType = 'likert_5' | 'single_choice' | 'freeform';
type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'ad_hoc';

interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  display_order: number;
  options: string[] | null;
  is_required: boolean;
}

interface Survey {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  frequency: Frequency;
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions?: SurveyQuestion[];
  _count?: { survey_responses: number };
  participation_count?: number;
  eligible_count?: number;
}

interface SurveyListResponse {
  data: Survey[];
  meta: { page: number; pageSize: number; total: number };
}

interface QuestionFormItem {
  tempId: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  is_required: boolean;
}

interface SurveyFormState {
  title: string;
  description: string;
  frequency: Frequency;
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  questions: QuestionFormItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<SurveyStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-500',
};

const STATUSES: Array<SurveyStatus | 'all'> = ['all', 'draft', 'active', 'closed', 'archived'];
const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'ad_hoc'];
const QUESTION_TYPES: QuestionType[] = ['likert_5', 'single_choice', 'freeform'];

const DEFAULT_FORM: SurveyFormState = {
  title: '',
  description: '',
  frequency: 'monthly',
  window_opens_at: '',
  window_closes_at: '',
  min_response_threshold: 5,
  dept_drill_down_threshold: 10,
  moderation_enabled: true,
  questions: [],
};

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateRange(opens: string, closes: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return `${fmt(opens)} — ${fmt(closes)}`;
}

function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SurveyManagementPage() {
  const t = useTranslations('wellbeing.surveys');

  // ── List state ──────────────────────────────────────────────────────────────
  const [surveys, setSurveys] = React.useState<Survey[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<SurveyStatus | 'all'>('all');

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingSurveyId, setEditingSurveyId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SurveyFormState>({ ...DEFAULT_FORM });
  const [isSaving, setIsSaving] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [removeConfirmIdx, setRemoveConfirmIdx] = React.useState<number | null>(null);

  // ── Confirm dialog state ────────────────────────────────────────────────────
  const [confirmAction, setConfirmAction] = React.useState<{
    type: 'activate' | 'close';
    surveyId: string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  // ── Fetch surveys ───────────────────────────────────────────────────────────

  const fetchSurveys = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient<SurveyListResponse>(
        `/api/v1/staff-wellbeing/surveys?page=${page}&pageSize=${PAGE_SIZE}&sortBy=created_at&sortOrder=desc`,
      );
      setSurveys(result.data);
      setTotal(result.meta.total);
    } catch {
      // Error handled by global handler
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  // ── Filtered surveys (client-side) ──────────────────────────────────────────

  const filteredSurveys = React.useMemo(() => {
    if (statusFilter === 'all') return surveys;
    return surveys.filter((s) => s.status === statusFilter);
  }, [surveys, statusFilter]);

  // ── Pagination ──────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Form helpers ────────────────────────────────────────────────────────────

  function updateField<K extends keyof SurveyFormState>(key: K, value: SurveyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addQuestion(type: QuestionType) {
    const newQ: QuestionFormItem = {
      tempId: generateTempId(),
      question_text: '',
      question_type: type,
      options: type === 'single_choice' ? ['', ''] : [],
      is_required: true,
    };
    setForm((prev) => ({ ...prev, questions: [...prev.questions, newQ] }));
  }

  function updateQuestion(idx: number, patch: Partial<QuestionFormItem>) {
    setForm((prev) => {
      const questions = [...prev.questions];
      const existing = questions[idx];
      if (!existing) return prev;
      questions[idx] = { ...existing, ...patch };
      return { ...prev, questions };
    });
  }

  function removeQuestion(idx: number) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
    setRemoveConfirmIdx(null);
  }

  function moveQuestion(idx: number, direction: 'up' | 'down') {
    setForm((prev) => {
      const questions = [...prev.questions];
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= questions.length) return prev;
      const a = questions[idx];
      const b = questions[target];
      if (!a || !b) return prev;
      questions[idx] = b;
      questions[target] = a;
      return { ...prev, questions };
    });
  }

  function addOption(qIdx: number) {
    setForm((prev) => {
      const questions = [...prev.questions];
      const existing = questions[qIdx];
      if (!existing) return prev;
      questions[qIdx] = {
        ...existing,
        options: [...existing.options, ''],
      };
      return { ...prev, questions };
    });
  }

  function updateOption(qIdx: number, optIdx: number, value: string) {
    setForm((prev) => {
      const questions = [...prev.questions];
      const existing = questions[qIdx];
      if (!existing) return prev;
      const options = [...existing.options];
      options[optIdx] = value;
      questions[qIdx] = { ...existing, options };
      return { ...prev, questions };
    });
  }

  function removeOption(qIdx: number, optIdx: number) {
    setForm((prev) => {
      const questions = [...prev.questions];
      const existing = questions[qIdx];
      if (!existing) return prev;
      const options = existing.options.filter((_, i) => i !== optIdx);
      questions[qIdx] = { ...existing, options };
      return { ...prev, questions };
    });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const isFormValid = React.useMemo(() => {
    if (!form.title.trim()) return false;
    if (!form.window_opens_at || !form.window_closes_at) return false;
    if (new Date(form.window_closes_at) <= new Date(form.window_opens_at)) return false;
    if (form.min_response_threshold < 3) return false;
    if (form.dept_drill_down_threshold < 8) return false;

    for (const q of form.questions) {
      if (!q.question_text.trim()) return false;
      if (q.question_type === 'single_choice') {
        if (q.options.length < 2) return false;
        if (q.options.some((o) => !o.trim())) return false;
      }
    }
    return true;
  }, [form]);

  // ── Open dialog for create/edit ─────────────────────────────────────────────

  function openCreate() {
    setEditingSurveyId(null);
    setForm({ ...DEFAULT_FORM });
    setAdvancedOpen(false);
    setRemoveConfirmIdx(null);
    setDialogOpen(true);
  }

  async function openEdit(survey: Survey) {
    setEditingSurveyId(survey.id);
    setAdvancedOpen(false);
    setRemoveConfirmIdx(null);

    try {
      const full = await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${survey.id}`);
      setForm({
        title: full.title,
        description: full.description ?? '',
        frequency: full.frequency,
        window_opens_at: full.window_opens_at,
        window_closes_at: full.window_closes_at,
        min_response_threshold: full.min_response_threshold,
        dept_drill_down_threshold: full.dept_drill_down_threshold,
        moderation_enabled: full.moderation_enabled,
        questions: (full.questions ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((q) => ({
            tempId: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options ?? [],
            is_required: q.is_required,
          })),
      });
      setDialogOpen(true);
    } catch {
      // Error handled by global handler
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave(activate: boolean) {
    if (!isFormValid) return;
    setIsSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      frequency: form.frequency,
      window_opens_at: fromDatetimeLocal(form.window_opens_at),
      window_closes_at: fromDatetimeLocal(form.window_closes_at),
      min_response_threshold: form.min_response_threshold,
      dept_drill_down_threshold: form.dept_drill_down_threshold,
      moderation_enabled: form.moderation_enabled,
      questions: form.questions.map((q, idx) => ({
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        display_order: idx + 1,
        options: q.question_type === 'single_choice' ? q.options.map((o) => o.trim()) : undefined,
        is_required: q.is_required,
      })),
    };

    try {
      if (editingSurveyId) {
        await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${editingSurveyId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (activate) {
          await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${editingSurveyId}/activate`, {
            method: 'POST',
          });
        }
      } else {
        const created = await apiClient<Survey>('/api/v1/staff-wellbeing/surveys', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (activate) {
          await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${created.id}/activate`, {
            method: 'POST',
          });
        }
      }

      setDialogOpen(false);
      void fetchSurveys();
    } catch {
      // Error handled by global handler
    } finally {
      setIsSaving(false);
    }
  }

  // ── Clone ───────────────────────────────────────────────────────────────────

  async function handleClone(surveyId: string) {
    try {
      const cloned = await apiClient<Survey>(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/clone`,
        { method: 'POST' },
      );
      await fetchSurveys();
      void openEdit(cloned);
    } catch {
      // Error handled by global handler
    }
  }

  // ── Activate / Close ────────────────────────────────────────────────────────

  async function handleConfirmAction() {
    if (!confirmAction) return;
    setIsConfirming(true);

    const endpoint =
      confirmAction.type === 'activate'
        ? `/api/v1/staff-wellbeing/surveys/${confirmAction.surveyId}/activate`
        : `/api/v1/staff-wellbeing/surveys/${confirmAction.surveyId}/close`;

    try {
      await apiClient<Survey>(endpoint, { method: 'POST' });
      setConfirmAction(null);
      void fetchSurveys();
    } catch {
      // Error handled by global handler
    } finally {
      setIsConfirming(false);
    }
  }

  // ── Response rate display ───────────────────────────────────────────────────

  function renderResponseRate(survey: Survey): React.ReactNode {
    if (survey.status === 'draft') return null;
    if (survey.status === 'active') {
      return <span className="text-sm text-text-secondary">{t('inProgress')}</span>;
    }

    const count = survey.participation_count ?? survey._count?.survey_responses ?? 0;
    const eligible = survey.eligible_count ?? 0;
    const rate = eligible > 0 ? Math.round((count / eligible) * 100) : 0;

    return (
      <span className="text-sm text-text-secondary">
        {t('responses', { count, total: eligible, rate })}
      </span>
    );
  }

  // ── Status actions ──────────────────────────────────────────────────────────

  function renderActions(survey: Survey): React.ReactNode {
    switch (survey.status) {
      case 'draft':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void openEdit(survey)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Edit2 className="me-1.5 h-3.5 w-3.5" />
              {t('edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClone(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction({ type: 'activate', surveyId: survey.id })}
              className="min-h-[44px] min-w-[44px]"
            >
              <Play className="me-1.5 h-3.5 w-3.5" />
              {t('activate')}
            </Button>
          </div>
        );
      case 'active':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction({ type: 'close', surveyId: survey.id })}
              className="min-h-[44px] min-w-[44px]"
            >
              <Square className="me-1.5 h-3.5 w-3.5" />
              {t('close')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClone(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
      case 'closed':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px] min-w-[44px]"
            >
              <ClipboardList className="me-1.5 h-3.5 w-3.5" />
              {t('viewResults')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClone(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
      case 'archived':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClone(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="me-1.5 h-4 w-4" />
            {t('createSurvey')}
          </Button>
        }
      />

      {/* Status filter */}
      <div className="w-full sm:w-48">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as SurveyStatus | 'all')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? t('allStatuses') : t(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredSurveys.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <ClipboardList className="h-8 w-8 text-text-tertiary" />
          </div>
          <p className="max-w-sm text-center text-sm text-text-secondary">{t('noSurveys')}</p>
          <Button onClick={openCreate}>
            <Plus className="me-1.5 h-4 w-4" />
            {t('createSurvey')}
          </Button>
        </div>
      )}

      {/* Desktop table */}
      {!isLoading && filteredSurveys.length > 0 && (
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="pb-3 pe-4 text-start font-medium">{t('surveyTitle')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('status')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('window')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('responseRate')}</th>
                  <th className="pb-3 text-end font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSurveys.map((survey) => (
                  <tr key={survey.id} className="border-b border-border last:border-b-0">
                    <td className="py-4 pe-4 font-medium text-text-primary">{survey.title}</td>
                    <td className="py-4 pe-4">
                      <Badge className={STATUS_COLORS[survey.status]}>
                        {t(survey.status)}
                      </Badge>
                    </td>
                    <td className="py-4 pe-4 text-text-secondary" dir="ltr">
                      {formatDateRange(survey.window_opens_at, survey.window_closes_at)}
                    </td>
                    <td className="py-4 pe-4">{renderResponseRate(survey)}</td>
                    <td className="py-4 text-end">{renderActions(survey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile card view */}
      {!isLoading && filteredSurveys.length > 0 && (
        <div className="space-y-3 md:hidden">
          {filteredSurveys.map((survey) => (
            <div
              key={survey.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-medium text-text-primary">{survey.title}</h3>
                <Badge className={STATUS_COLORS[survey.status]}>
                  {t(survey.status)}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-text-secondary" dir="ltr">
                {formatDateRange(survey.window_opens_at, survey.window_closes_at)}
              </p>
              {renderResponseRate(survey) && (
                <div className="mt-1">{renderResponseRate(survey)}</div>
              )}
              <Separator className="my-3" />
              {renderActions(survey)}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-[44px] min-w-[44px]"
          >
            &lsaquo;
          </Button>
          <span className="text-sm text-text-secondary" dir="ltr">
            {t('page', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="min-h-[44px] min-w-[44px]"
          >
            &rsaquo;
          </Button>
        </div>
      )}

      {/* ── Create / Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSurveyId ? t('editTitle') : t('createTitle')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="survey-title">{t('surveyTitle')} *</Label>
              <Input
                id="survey-title"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="survey-desc">{t('description')}</Label>
              <Textarea
                id="survey-desc"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="w-full"
              />
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label>{t('frequency')}</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => updateField('frequency', v as Frequency)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(f === 'ad_hoc' ? 'adHoc' : f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Window dates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="window-opens">{t('windowOpens')}</Label>
                <Input
                  id="window-opens"
                  type="datetime-local"
                  value={toDatetimeLocal(form.window_opens_at)}
                  onChange={(e) => updateField('window_opens_at', e.target.value)}
                  className="w-full"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="window-closes">{t('windowCloses')}</Label>
                <Input
                  id="window-closes"
                  type="datetime-local"
                  value={toDatetimeLocal(form.window_closes_at)}
                  onChange={(e) => updateField('window_closes_at', e.target.value)}
                  className="w-full"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Advanced settings (collapsible) */}
            <div className="rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-secondary"
              >
                {t('advancedSettings')}
                <ChevronDown
                  className={`h-4 w-4 text-text-tertiary transition-transform duration-200 ${
                    advancedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {advancedOpen && (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="min-threshold">{t('minResponseThreshold')}</Label>
                    <Input
                      id="min-threshold"
                      type="number"
                      min={3}
                      value={form.min_response_threshold}
                      onChange={(e) =>
                        updateField('min_response_threshold', Math.max(3, Number(e.target.value)))
                      }
                      className="w-full sm:w-28"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dept-threshold">{t('deptDrillDownThreshold')}</Label>
                    <Input
                      id="dept-threshold"
                      type="number"
                      min={8}
                      value={form.dept_drill_down_threshold}
                      onChange={(e) =>
                        updateField(
                          'dept_drill_down_threshold',
                          Math.max(8, Number(e.target.value)),
                        )
                      }
                      className="w-full sm:w-28"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="moderation"
                      checked={form.moderation_enabled}
                      onCheckedChange={(checked) => updateField('moderation_enabled', checked)}
                    />
                    <Label htmlFor="moderation">{t('moderationEnabled')}</Label>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Questions builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('questions')}</Label>
                <span className="text-xs text-text-tertiary">{t('questionGuidance')}</span>
              </div>

              {form.questions.map((q, qIdx) => (
                <div
                  key={q.tempId}
                  className="rounded-xl border border-border bg-surface p-4 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-2 shrink-0 text-xs font-semibold text-text-tertiary"
                      dir="ltr"
                    >
                      {qIdx + 1}.
                    </span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={q.question_text}
                          onChange={(e) => updateQuestion(qIdx, { question_text: e.target.value })}
                          placeholder={t('questionText')}
                          className="flex-1"
                        />
                        <Badge className="shrink-0" variant="secondary">
                          {t(
                            q.question_type === 'likert_5'
                              ? 'likert5'
                              : q.question_type === 'single_choice'
                                ? 'singleChoice'
                                : 'freeform',
                          )}
                        </Badge>
                      </div>

                      {/* Single choice options */}
                      {q.question_type === 'single_choice' && (
                        <div className="space-y-2 ps-4">
                          <Label className="text-xs">{t('options')}</Label>
                          {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-2">
                              <Input
                                value={opt}
                                onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                                className="flex-1"
                              />
                              {q.options.length > 2 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeOption(qIdx, optIdx)}
                                  className="min-h-[44px] min-w-[44px] shrink-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addOption(qIdx)}
                            className="min-h-[44px]"
                          >
                            <Plus className="me-1 h-3.5 w-3.5" />
                            {t('addOption')}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Reorder + remove */}
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={qIdx === 0}
                        onClick={() => moveQuestion(qIdx, 'up')}
                        className="min-h-[44px] min-w-[44px]"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={qIdx === form.questions.length - 1}
                        onClick={() => moveQuestion(qIdx, 'down')}
                        className="min-h-[44px] min-w-[44px]"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      {removeConfirmIdx === qIdx ? (
                        <div className="flex gap-1">
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => removeQuestion(qIdx)}
                            className="min-h-[44px] min-w-[44px]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoveConfirmIdx(null)}
                            className="min-h-[44px] min-w-[44px]"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemoveConfirmIdx(qIdx)}
                          className="min-h-[44px] min-w-[44px]"
                        >
                          <Trash2 className="h-4 w-4 text-text-tertiary" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add question type selector */}
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => addQuestion(type)}
                    className="min-h-[44px]"
                  >
                    <Plus className="me-1 h-3.5 w-3.5" />
                    {t(
                      type === 'likert_5'
                        ? 'likert5'
                        : type === 'single_choice'
                          ? 'singleChoice'
                          : 'freeform',
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void handleSave(false)}
              disabled={!isFormValid || isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('saveDraft')}
            </Button>
            <Button
              onClick={() => void handleSave(true)}
              disabled={!isFormValid || isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t('saveAndActivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Activate / Close Confirmation ──────────────────────────────────────── */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'activate' ? t('activate') : t('close')}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'activate' ? t('activateConfirm') : t('closeConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={isConfirming}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleConfirmAction()}
              disabled={isConfirming}
            >
              {isConfirming && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {confirmAction?.type === 'activate' ? t('activate') : t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
