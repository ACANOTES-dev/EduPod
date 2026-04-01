'use client';

import { ArrowLeft, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
  year_group?: { name: string } | null;
}

interface GoalRow {
  id: string;
  goal_text: string;
  measurable_target: string;
  deadline: string;
}

interface StrategyRow {
  id: string;
  strategy_text: string;
  responsible_staff_id: string;
  frequency: string;
}

const INTERVENTION_TYPE_VALUES = [
  'behaviour_plan',
  'mentoring',
  'counselling_referral',
  'restorative',
  'academic_support',
  'parent_engagement',
  'external_agency',
  'other',
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateInterventionPage() {
  const t = useTranslations('behaviour.newIntervention');
  const tInterventions = useTranslations('behaviour.interventions');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // Form state
  const [interventionType, setInterventionType] = React.useState('behaviour_plan');
  const [title, setTitle] = React.useState('');
  const [triggerDescription, setTriggerDescription] = React.useState('');
  const [sendAwareness, setSendAwareness] = React.useState(false);
  const [sendNotes, setSendNotes] = React.useState('');
  const [startDate, setStartDate] = React.useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [targetEndDate, setTargetEndDate] = React.useState('');
  const [reviewFrequencyDays, setReviewFrequencyDays] = React.useState('14');
  const [assignedToId, setAssignedToId] = React.useState('');

  // Student search
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);

  // Goals builder
  const [goals, setGoals] = React.useState<GoalRow[]>([
    { id: crypto.randomUUID(), goal_text: '', measurable_target: '', deadline: '' },
  ]);

  // Strategies builder
  const [strategies, setStrategies] = React.useState<StrategyRow[]>([
    { id: crypto.randomUUID(), strategy_text: '', responsible_staff_id: '', frequency: '' },
  ]);

  // UI state
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Student search with debounce
  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      apiClient<{ data: StudentOption[] }>(
        `/api/v1/behaviour/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
      )
        .then((res) => setStudentResults(res.data ?? []))
        .catch(() => undefined);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [studentSearch]);

  const selectStudent = (student: StudentOption) => {
    setSelectedStudent(student);
    setStudentSearch('');
    setStudentResults([]);
  };

  // ─── Goals helpers ──────────────────────────────────────────────────────

  const addGoal = () => {
    setGoals((prev) => [
      ...prev,
      { id: crypto.randomUUID(), goal_text: '', measurable_target: '', deadline: '' },
    ]);
  };

  const removeGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const updateGoal = (id: string, field: keyof GoalRow, value: string) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };

  // ─── Strategies helpers ─────────────────────────────────────────────────

  const addStrategy = () => {
    setStrategies((prev) => [
      ...prev,
      { id: crypto.randomUUID(), strategy_text: '', responsible_staff_id: '', frequency: '' },
    ]);
  };

  const removeStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
  };

  const updateStrategy = (id: string, field: keyof StrategyRow, value: string) => {
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      setError(t('errors.selectStudent'));
      return;
    }
    if (!title.trim()) {
      setError(t('errors.enterTitle'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/behaviour/interventions', {
        method: 'POST',
        body: JSON.stringify({
          student_id: selectedStudent.id,
          intervention_type: interventionType,
          title: title.trim(),
          trigger_description: triggerDescription.trim() || undefined,
          send_awareness: sendAwareness,
          send_notes: sendAwareness ? sendNotes.trim() || undefined : undefined,
          goals: goals
            .filter((g) => g.goal_text.trim())
            .map((g) => ({
              goal_text: g.goal_text.trim(),
              measurable_target: g.measurable_target.trim() || undefined,
              deadline: g.deadline || undefined,
            })),
          strategies: strategies
            .filter((s) => s.strategy_text.trim())
            .map((s) => ({
              strategy_text: s.strategy_text.trim(),
              responsible_staff_id: s.responsible_staff_id || undefined,
              frequency: s.frequency.trim() || undefined,
            })),
          start_date: startDate,
          target_end_date: targetEndDate || undefined,
          review_frequency_days: parseInt(reviewFrequencyDays, 10) || 14,
          assigned_to: assignedToId || undefined,
        }),
      });
      router.push(`/${locale}/behaviour/interventions/${res.data.id}`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/behaviour/interventions`}>
            <Button variant="outline">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('back')}
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
        {/* 1. Student Search */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.student')}</Label>

          {selectedStudent ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
                {selectedStudent.first_name} {selectedStudent.last_name}
                {selectedStudent.year_group && (
                  <span className="text-xs text-primary-500">
                    ({selectedStudent.year_group.name})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="hover:text-primary-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder={t('placeholders.searchStudents')}
                className="ps-9 text-base"
              />
              {studentResults.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                  {studentResults.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-surface-secondary"
                        onClick={() => selectStudent(s)}
                      >
                        <span className="font-medium text-text-primary">
                          {s.first_name} {s.last_name}
                        </span>
                        {s.year_group && (
                          <span className="text-xs text-text-tertiary">{s.year_group.name}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 2. Type + Title */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">{t('labels.interventionType')}</Label>
              <Select value={interventionType} onValueChange={setInterventionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVENTION_TYPE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tInterventions(`types.${value}` as Parameters<typeof tInterventions>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">{t('labels.titleField')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('placeholders.title')}
                className="text-base"
                required
              />
            </div>
          </div>
        </div>

        {/* 3. Trigger Description */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.triggerReason')}</Label>
          <Textarea
            value={triggerDescription}
            onChange={(e) => setTriggerDescription(e.target.value)}
            placeholder={t('placeholders.trigger')}
            rows={3}
            className="text-base"
          />
        </div>

        {/* 4. SEND Awareness */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t('labels.sendAwareness')}</Label>
              <p className="text-xs text-text-tertiary">{t('labels.sendAwarenessDescription')}</p>
            </div>
            <Switch checked={sendAwareness} onCheckedChange={setSendAwareness} />
          </div>
          {sendAwareness && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                {t('labels.sendNotes')}
              </Label>
              <Textarea
                value={sendNotes}
                onChange={(e) => setSendNotes(e.target.value)}
                placeholder={t('placeholders.sendNotes')}
                rows={3}
                className="border-amber-200 text-base"
              />
            </div>
          )}
        </div>

        {/* 5. Goals Builder */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-sm font-semibold">{t('labels.goals')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={addGoal}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t('addGoal')}
            </Button>
          </div>
          <div className="space-y-3">
            {goals.map((goal, idx) => (
              <div
                key={goal.id}
                className="rounded-lg border border-border bg-surface-secondary p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-text-tertiary">
                    {t('labels.goalNumber', { index: idx + 1 })}
                  </span>
                  {goals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGoal(goal.id)}
                      className="text-text-tertiary transition-colors hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-text-tertiary">{t('labels.goal')}</Label>
                    <Input
                      value={goal.goal_text}
                      onChange={(e) => updateGoal(goal.id, 'goal_text', e.target.value)}
                      placeholder={t('placeholders.goal')}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-text-tertiary">
                      {t('labels.measurableTarget')}
                    </Label>
                    <Input
                      value={goal.measurable_target}
                      onChange={(e) => updateGoal(goal.id, 'measurable_target', e.target.value)}
                      placeholder={t('placeholders.measurableTarget')}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-text-tertiary">{t('labels.deadline')}</Label>
                    <Input
                      type="date"
                      value={goal.deadline}
                      onChange={(e) => updateGoal(goal.id, 'deadline', e.target.value)}
                      className="text-base"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Strategies Builder */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-sm font-semibold">{t('labels.strategies')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={addStrategy}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t('addStrategy')}
            </Button>
          </div>
          <div className="space-y-3">
            {strategies.map((strategy, idx) => (
              <div
                key={strategy.id}
                className="rounded-lg border border-border bg-surface-secondary p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-text-tertiary">
                    {t('labels.strategyNumber', { index: idx + 1 })}
                  </span>
                  {strategies.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStrategy(strategy.id)}
                      className="text-text-tertiary transition-colors hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-text-tertiary">{t('labels.strategy')}</Label>
                    <Input
                      value={strategy.strategy_text}
                      onChange={(e) => updateStrategy(strategy.id, 'strategy_text', e.target.value)}
                      placeholder={t('placeholders.strategy')}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-text-tertiary">
                      {t('labels.responsibleStaff')}
                    </Label>
                    <Input
                      value={strategy.responsible_staff_id}
                      onChange={(e) =>
                        updateStrategy(strategy.id, 'responsible_staff_id', e.target.value)
                      }
                      placeholder={t('placeholders.responsibleStaff')}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-text-tertiary">{t('labels.frequency')}</Label>
                    <Input
                      value={strategy.frequency}
                      onChange={(e) => updateStrategy(strategy.id, 'frequency', e.target.value)}
                      placeholder={t('placeholders.frequency')}
                      className="text-base"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 7. Dates + Review Frequency */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.schedule')}</Label>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.startDate')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-base"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.targetEndDate')}</Label>
              <Input
                type="date"
                value={targetEndDate}
                onChange={(e) => setTargetEndDate(e.target.value)}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-text-tertiary">{t('labels.reviewFrequency')}</Label>
              <Input
                type="number"
                min="1"
                value={reviewFrequencyDays}
                onChange={(e) => setReviewFrequencyDays(e.target.value)}
                className="text-base"
              />
            </div>
          </div>
        </div>

        {/* 8. Assigned To */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <Label className="mb-3 block text-sm font-semibold">{t('labels.assignedTo')}</Label>
          <Input
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            placeholder={t('placeholders.assignedTo')}
            className="font-mono text-sm"
          />
          <p className="mt-1.5 text-xs text-text-tertiary">{t('labels.assignedToHint')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link href={`/${locale}/behaviour/interventions`}>
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              {t('cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? t('creating') : t('createIntervention')}
          </Button>
        </div>
      </form>
    </div>
  );
}
