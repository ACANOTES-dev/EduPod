'use client';

import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
  Switch,
  Textarea,
} from '@school/ui';


import {
  DEFAULT_FORM,
  FREQUENCIES,
  QUESTION_TYPES,
  fromDatetimeLocal,
  generateTempId,
  toDatetimeLocal,
} from './survey-types';
import type {
  Frequency,
  QuestionFormItem,
  QuestionType,
  Survey,
  SurveyFormState,
} from './survey-types';

import { apiClient } from '@/lib/api-client';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SurveyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSurveyId: string | null;
  initialForm: SurveyFormState;
  onSaved: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SurveyFormDialog({
  open,
  onOpenChange,
  editingSurveyId,
  initialForm,
  onSaved,
}: SurveyFormDialogProps) {
  const t = useTranslations('wellbeing.surveys');

  const [form, setForm] = React.useState<SurveyFormState>({ ...DEFAULT_FORM });
  const [isSaving, setIsSaving] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [removeConfirmIdx, setRemoveConfirmIdx] = React.useState<number | null>(null);

  // Sync form state when dialog opens with new initial values
  React.useEffect(() => {
    if (open) {
      setForm({ ...initialForm });
      setAdvancedOpen(false);
      setRemoveConfirmIdx(null);
    }
  }, [open, initialForm]);

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
      questions[qIdx] = { ...existing, options: [...existing.options, ''] };
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

      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('[handleSave]', err);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                      updateField('dept_drill_down_threshold', Math.max(8, Number(e.target.value)))
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
                className="space-y-3 rounded-xl border border-border bg-surface p-4"
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
  );
}
