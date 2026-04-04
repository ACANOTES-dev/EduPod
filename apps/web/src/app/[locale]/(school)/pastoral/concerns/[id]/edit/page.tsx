'use client';

import { Save } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import {
  formatPastoralValue,
  getLocaleFromPathname,
  PASTORAL_SEVERITIES,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCaseListItem,
  type PastoralConcernDetail,
  type SearchOption,
} from '@/lib/pastoral';

export default function EditPastoralConcernPage() {
  const t = useTranslations('pastoral.editConcern');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const concernId = params?.id as string;
  const [concern, setConcern] = React.useState<PastoralConcernDetail | null>(null);
  const [linkedCases, setLinkedCases] = React.useState<PastoralCaseListItem[]>([]);
  const [studentsInvolved, setStudentsInvolved] = React.useState<SearchOption[]>([]);
  const [severity, setSeverity] = React.useState('routine');
  const [followUpNeeded, setFollowUpNeeded] = React.useState(false);
  const [followUpSuggestion, setFollowUpSuggestion] = React.useState('');
  const [linkedCaseId, setLinkedCaseId] = React.useState('none');
  const [narrative, setNarrative] = React.useState('');
  const [amendmentReason, setAmendmentReason] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    void apiClient<PastoralApiDetailResponse<PastoralConcernDetail>>(
      `/api/v1/pastoral/concerns/${concernId}`,
      { silent: true },
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        const detail = response.data;
        const latestVersion = detail.versions[detail.versions.length - 1];

        setConcern(detail);
        setSeverity(detail.severity);
        setFollowUpNeeded(detail.follow_up_needed);
        setFollowUpSuggestion(detail.follow_up_suggestion ?? '');
        setLinkedCaseId(detail.case_id ?? 'none');
        setNarrative(latestVersion?.narrative ?? '');
        setStudentsInvolved(
          detail.students_involved.map((student) => ({
            id: student.student_id,
            label: student.student_name,
          })),
        );
      })
      .catch((err) => {
        console.error('[ConcernsEditPage]', err);
        if (!cancelled) {
          setConcern(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [concernId]);

  React.useEffect(() => {
    const studentId = concern?.student_id;

    if (!studentId) {
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
      `/api/v1/pastoral/cases?page=1&pageSize=20&student_id=${studentId}`,
      { silent: true },
    )
      .then((response) => {
        if (!cancelled) {
          setLinkedCases(response.data ?? []);
        }
      })
      .catch((err) => {
        console.error('[ConcernsEditPage]', err);
        if (!cancelled) {
          setLinkedCases([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [concern?.student_id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!concern) {
      return;
    }

    const latestNarrative = concern.versions[concern.versions.length - 1]?.narrative ?? '';
    const narrativeChanged = latestNarrative.trim() !== narrative.trim();

    if (narrativeChanged && !amendmentReason.trim()) {
      setError(t('errors.amendmentReason'));
      return;
    }

    setIsSaving(true);

    try {
      await apiClient<PastoralApiDetailResponse<PastoralConcernDetail>>(
        `/api/v1/pastoral/concerns/${concernId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            severity,
            follow_up_needed: followUpNeeded,
            follow_up_suggestion: followUpNeeded ? followUpSuggestion.trim() || null : null,
            case_id: linkedCaseId === 'none' ? null : linkedCaseId,
            students_involved: studentsInvolved.map((student) => ({
              student_id: student.id,
            })),
          }),
          silent: true,
        },
      );

      if (narrativeChanged) {
        await apiClient(`/api/v1/pastoral/concerns/${concernId}/amend`, {
          method: 'POST',
          body: JSON.stringify({
            narrative: narrative.trim(),
            amendment_reason: amendmentReason.trim(),
          }),
          silent: true,
        });
      }

      router.push(`/${locale}/pastoral/concerns/${concernId}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!concern) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description', {
          student: concern.student_name,
          category: formatPastoralValue(concern.category),
        })}
      />

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('metadataSection')}</h2>
            <div className="mt-4 grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('fields.severity')}</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PASTORAL_SEVERITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`severity.${option}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('fields.linkedCase')}</Label>
                  <Select value={linkedCaseId} onValueChange={setLinkedCaseId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('fields.noLinkedCase')}</SelectItem>
                      {linkedCases.map((caseItem) => (
                        <SelectItem key={caseItem.id} value={caseItem.id}>
                          {caseItem.case_number}
                          {' · '}
                          {formatPastoralValue(caseItem.status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={followUpNeeded}
                    onChange={(event) => setFollowUpNeeded(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border text-emerald-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-text-primary">
                      {t('fields.followUpNeeded')}
                    </span>
                    <span className="mt-1 block text-xs text-text-tertiary">
                      {t('fields.followUpNeededHelp')}
                    </span>
                  </span>
                </label>
              </div>

              {followUpNeeded ? (
                <div className="space-y-2">
                  <Label htmlFor="follow_up_suggestion">{t('fields.followUpSuggestion')}</Label>
                  <Textarea
                    id="follow_up_suggestion"
                    value={followUpSuggestion}
                    onChange={(event) => setFollowUpSuggestion(event.target.value)}
                    rows={3}
                    placeholder={t('fields.followUpSuggestionPlaceholder')}
                  />
                </div>
              ) : null}

              <SearchPicker
                label={t('fields.studentsInvolved')}
                placeholder={t('fields.studentsInvolvedPlaceholder')}
                search={searchStudents}
                selected={studentsInvolved}
                onChange={setStudentsInvolved}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
                disabledIds={[concern.student_id]}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('narrativeSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="narrative">{t('fields.narrative')}</Label>
                <Textarea
                  id="narrative"
                  value={narrative}
                  onChange={(event) => setNarrative(event.target.value)}
                  rows={10}
                  placeholder={t('fields.narrativePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amendment_reason">{t('fields.amendmentReason')}</Label>
                <Textarea
                  id="amendment_reason"
                  value={amendmentReason}
                  onChange={(event) => setAmendmentReason(event.target.value)}
                  rows={3}
                  placeholder={t('fields.amendmentReasonPlaceholder')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('guardrailsTitle')}</h2>
            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <p>{t('guardrails.versioning')}</p>
              <p>{t('guardrails.tier')}</p>
              <p>{t('guardrails.caseLink')}</p>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3">
              <Button type="submit" disabled={isSaving}>
                <Save className="me-2 h-4 w-4" />
                {isSaving ? t('saving') : t('save')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push(`/${locale}/pastoral/concerns/${concernId}`)}
              >
                {sharedT('cancel')}
              </Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
