'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  formatStudentName,
  getLocaleFromPathname,
  type InterventionTypeOption,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCaseDetail,
  type PastoralCaseListItem,
  type PastoralInterventionTargetOutcome,
} from '@/lib/pastoral';

function buildNextReviewDate(reviewCycleWeeks: number): string {
  const base = new Date();
  base.setDate(base.getDate() + reviewCycleWeeks * 7);
  return base.toISOString();
}

export default function NewPastoralInterventionPage() {
  const t = useTranslations('pastoral.newIntervention');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCaseId = searchParams?.get('caseId') ?? '';
  const [cases, setCases] = React.useState<PastoralCaseListItem[]>([]);
  const [caseId, setCaseId] = React.useState(preselectedCaseId);
  const [availableStudents, setAvailableStudents] = React.useState<PastoralCaseDetail['students']>(
    [],
  );
  const [studentId, setStudentId] = React.useState('');
  const [interventionTypes, setInterventionTypes] = React.useState<InterventionTypeOption[]>([]);
  const [interventionType, setInterventionType] = React.useState('');
  const [continuumLevel, setContinuumLevel] = React.useState('2');
  const [reviewCycleWeeks, setReviewCycleWeeks] = React.useState('6');
  const [targetOutcomes, setTargetOutcomes] = React.useState<PastoralInterventionTargetOutcome[]>([
    { description: '', measurable_target: '' },
  ]);
  const [parentInformed, setParentInformed] = React.useState(true);
  const [parentConsented, setParentConsented] = React.useState('unknown');
  const [parentInput, setParentInput] = React.useState('');
  const [studentVoice, setStudentVoice] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    void Promise.all([
      apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
        '/api/v1/pastoral/cases?page=1&pageSize=100',
        {
          silent: true,
        },
      ),
      apiClient<InterventionTypeOption[]>('/api/v1/pastoral/settings/intervention-types', {
        silent: true,
      }),
    ])
      .then(([caseResponse, typeResponse]) => {
        if (cancelled) {
          return;
        }

        setCases(
          (caseResponse.data ?? []).filter((item) => ['open', 'active'].includes(item.status)),
        );
        setInterventionTypes(typeResponse ?? []);

        const firstActive = (typeResponse ?? []).find((item) => item.active);
        if (firstActive && !interventionType) {
          setInterventionType(firstActive.key);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [interventionType]);

  React.useEffect(() => {
    if (!caseId) {
      setAvailableStudents([]);
      setStudentId('');
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiDetailResponse<PastoralCaseDetail>>(
      `/api/v1/pastoral/cases/${caseId}`,
      {
        silent: true,
      },
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAvailableStudents(response.data.students);
        setStudentId((current) => current || response.data.student_id);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableStudents([]);
          setStudentId('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const updateOutcome = (
    index: number,
    field: keyof PastoralInterventionTargetOutcome,
    value: string,
  ) => {
    setTargetOutcomes((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const validOutcomes = targetOutcomes.filter(
    (item) => item.description.trim().length > 0 && item.measurable_target.trim().length > 0,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const reviewWeeks = Number(reviewCycleWeeks);
    if (!caseId) {
      setError(t('errors.case'));
      return;
    }
    if (!studentId) {
      setError(t('errors.student'));
      return;
    }
    if (!interventionType) {
      setError(t('errors.type'));
      return;
    }
    if (!Number.isFinite(reviewWeeks) || reviewWeeks < 1) {
      setError(t('errors.reviewCycle'));
      return;
    }
    if (validOutcomes.length === 0) {
      setError(t('errors.outcomes'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<PastoralApiDetailResponse<{ id: string }>>(
        '/api/v1/pastoral/interventions',
        {
          method: 'POST',
          body: JSON.stringify({
            case_id: caseId,
            student_id: studentId,
            intervention_type: interventionType,
            continuum_level: Number(continuumLevel),
            target_outcomes: validOutcomes,
            review_cycle_weeks: reviewWeeks,
            next_review_date: buildNextReviewDate(reviewWeeks),
            parent_informed: parentInformed,
            parent_consented: parentConsented === 'unknown' ? null : parentConsented === 'yes',
            parent_input: parentInput.trim() || undefined,
            student_voice: studentVoice.trim() || undefined,
          }),
        },
      );

      router.push(`/${locale}/pastoral/interventions/${response.data.id}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('caseSection')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fields.case')}</Label>
                <Select
                  value={caseId || 'none'}
                  onValueChange={(value) => setCaseId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.casePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noCase')}</SelectItem>
                    {cases.map((caseItem) => (
                      <SelectItem key={caseItem.id} value={caseItem.id}>
                        {caseItem.case_number}
                        {' · '}
                        {caseItem.student_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fields.student')}</Label>
                <Select
                  value={studentId || 'none'}
                  onValueChange={(value) => setStudentId(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.studentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noStudent')}</SelectItem>
                    {availableStudents.map((student) => (
                      <SelectItem key={student.student_id} value={student.student_id}>
                        {student.name}
                        {student.is_primary ? ` · ${t('primaryStudent')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('planSection')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fields.type')}</Label>
                <Select
                  value={interventionType || 'none'}
                  onValueChange={(value) => setInterventionType(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.typePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noType')}</SelectItem>
                    {interventionTypes
                      .filter((item) => item.active)
                      .map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fields.continuumLevel')}</Label>
                <Select value={continuumLevel} onValueChange={setContinuumLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {t(`continuum.level${level}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="pt-1">
                  <PastoralTierBadge tier={Number(continuumLevel)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review_cycle_weeks">{t('fields.reviewCycle')}</Label>
                <Input
                  id="review_cycle_weeks"
                  type="number"
                  min={1}
                  value={reviewCycleWeeks}
                  onChange={(event) => setReviewCycleWeeks(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('outcomesSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('outcomesDescription')}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setTargetOutcomes((current) => [
                    ...current,
                    { description: '', measurable_target: '' },
                  ])
                }
              >
                <Plus className="me-2 h-4 w-4" />
                {t('addOutcome')}
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {targetOutcomes.map((outcome, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-surface-secondary/60 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <Label>{t('fields.outcomeDescription')}</Label>
                      <Textarea
                        value={outcome.description}
                        onChange={(event) =>
                          updateOutcome(index, 'description', event.target.value)
                        }
                        rows={3}
                        placeholder={t('fields.outcomeDescriptionPlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('fields.outcomeTarget')}</Label>
                      <Textarea
                        value={outcome.measurable_target}
                        onChange={(event) =>
                          updateOutcome(index, 'measurable_target', event.target.value)
                        }
                        rows={3}
                        placeholder={t('fields.outcomeTargetPlaceholder')}
                      />
                    </div>
                    <div className="flex items-start justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={targetOutcomes.length === 1}
                        onClick={() =>
                          setTargetOutcomes((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('engagementSection')}</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                <input
                  type="checkbox"
                  checked={parentInformed}
                  onChange={(event) => setParentInformed(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-emerald-600"
                />
                <span className="text-sm text-text-primary">{t('fields.parentInformed')}</span>
              </label>

              <div className="space-y-2">
                <Label>{t('fields.parentConsented')}</Label>
                <Select value={parentConsented} onValueChange={setParentConsented}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">{sharedT('notRecorded')}</SelectItem>
                    <SelectItem value="yes">{t('consent.yes')}</SelectItem>
                    <SelectItem value="no">{t('consent.no')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_input">{t('fields.parentInput')}</Label>
                <Textarea
                  id="parent_input"
                  value={parentInput}
                  onChange={(event) => setParentInput(event.target.value)}
                  rows={4}
                  placeholder={t('fields.parentInputPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_voice">{t('fields.studentVoice')}</Label>
                <Textarea
                  id="student_voice"
                  value={studentVoice}
                  onChange={(event) => setStudentVoice(event.target.value)}
                  rows={4}
                  placeholder={t('fields.studentVoicePlaceholder')}
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Save className="me-2 h-4 w-4" />
                {isSubmitting ? t('saving') : t('submit')}
              </Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
