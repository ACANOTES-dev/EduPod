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
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PastoralSeverityBadge, PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  formatPastoralValue,
  getLocaleFromPathname,
  PASTORAL_EDITABLE_TIERS,
  searchStaff,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralConcernDetail,
  type PastoralConcernListItem,
  type SearchOption,
} from '@/lib/pastoral';
import { formatDateTime } from '@/lib/format-date';

export default function NewPastoralCasePage() {
  const t = useTranslations('pastoral.newCase');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedConcernId = searchParams?.get('concernId') ?? null;
  const [primaryStudent, setPrimaryStudent] = React.useState<SearchOption[]>([]);
  const [owner, setOwner] = React.useState<SearchOption[]>([]);
  const [additionalStudents, setAdditionalStudents] = React.useState<SearchOption[]>([]);
  const [candidateConcerns, setCandidateConcerns] = React.useState<PastoralConcernListItem[]>([]);
  const [selectedConcernIds, setSelectedConcernIds] = React.useState<string[]>([]);
  const [tier, setTier] = React.useState('1');
  const [openedReason, setOpenedReason] = React.useState('');
  const [nextReviewDate, setNextReviewDate] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!preselectedConcernId) {
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiDetailResponse<PastoralConcernDetail>>(
      `/api/v1/pastoral/concerns/${preselectedConcernId}`,
      { silent: true },
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        setPrimaryStudent([
          {
            id: response.data.student_id,
            label: response.data.student_name,
          },
        ]);
        setSelectedConcernIds([response.data.id]);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [preselectedConcernId]);

  React.useEffect(() => {
    const studentId = primaryStudent[0]?.id;

    if (!studentId) {
      setCandidateConcerns([]);
      return;
    }

    let cancelled = false;

    void apiClient<PastoralApiListResponse<PastoralConcernListItem>>(
      `/api/v1/pastoral/concerns?page=1&pageSize=50&student_id=${studentId}`,
      { silent: true },
    )
      .then((response) => {
        if (!cancelled) {
          setCandidateConcerns(
            (response.data ?? []).filter(
              (concern) => concern.case_id === null || selectedConcernIds.includes(concern.id),
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCandidateConcerns([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [primaryStudent, selectedConcernIds]);

  const toggleConcern = (concernId: string) => {
    setSelectedConcernIds((current) =>
      current.includes(concernId)
        ? current.filter((id) => id !== concernId)
        : [...current, concernId],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!primaryStudent[0]) {
      setError(t('errors.student'));
      return;
    }

    if (!owner[0]) {
      setError(t('errors.owner'));
      return;
    }

    if (selectedConcernIds.length === 0) {
      setError(t('errors.concerns'));
      return;
    }

    if (!openedReason.trim()) {
      setError(t('errors.reason'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<PastoralApiDetailResponse<{ id: string }>>(
        '/api/v1/pastoral/cases',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: primaryStudent[0].id,
            concern_ids: selectedConcernIds,
            owner_user_id: owner[0].id,
            opened_reason: openedReason.trim(),
            tier: Number(tier),
            next_review_date: nextReviewDate
              ? new Date(`${nextReviewDate}T09:00:00`).toISOString()
              : undefined,
            additional_student_ids: additionalStudents.map((student) => student.id),
          }),
        },
      );

      router.push(`/${locale}/pastoral/cases/${response.data.id}`);
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
            <h2 className="text-lg font-semibold text-text-primary">{t('studentsSection')}</h2>
            <div className="mt-4 space-y-5">
              <SearchPicker
                label={t('fields.primaryStudent')}
                placeholder={t('fields.primaryStudentPlaceholder')}
                search={searchStudents}
                selected={primaryStudent}
                onChange={(next) => {
                  const selected = next.slice(0, 1);
                  setPrimaryStudent(selected);
                  const selectedPrimary = selected[0];
                  setAdditionalStudents((current) =>
                    selectedPrimary
                      ? current.filter((student) => student.id !== selectedPrimary.id)
                      : current,
                  );
                  setSelectedConcernIds([]);
                }}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              <SearchPicker
                label={t('fields.additionalStudents')}
                placeholder={t('fields.additionalStudentsPlaceholder')}
                search={searchStudents}
                selected={additionalStudents}
                onChange={setAdditionalStudents}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
                disabledIds={primaryStudent[0] ? [primaryStudent[0].id] : []}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('concernsSection')}</h2>
            <div className="mt-4 space-y-3">
              {candidateConcerns.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('emptyConcerns')}
                </p>
              ) : (
                candidateConcerns.map((concern) => (
                  <label
                    key={concern.id}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-4"
                  >
                    <input
                      type="checkbox"
                      checked={selectedConcernIds.includes(concern.id)}
                      onChange={() => toggleConcern(concern.id)}
                      className="mt-1 h-4 w-4 rounded border-border text-emerald-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PastoralSeverityBadge severity={concern.severity} />
                        <PastoralTierBadge tier={concern.tier} />
                      </div>
                      <p className="mt-3 text-sm font-medium text-text-primary">
                        {formatPastoralValue(concern.category)}
                      </p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {formatDateTime(concern.occurred_at)}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('workflowSection')}</h2>
            <div className="mt-4 space-y-5">
              <SearchPicker
                label={t('fields.owner')}
                placeholder={t('fields.ownerPlaceholder')}
                search={searchStaff}
                selected={owner}
                onChange={(next) => setOwner(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStaff')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              <div className="space-y-2">
                <Label>{t('fields.tier')}</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_EDITABLE_TIERS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {t(`tier.tier${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_review_date">{t('fields.nextReviewDate')}</Label>
                <Input
                  id="next_review_date"
                  type="date"
                  value={nextReviewDate}
                  onChange={(event) => setNextReviewDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opened_reason">{t('fields.openedReason')}</Label>
                <Textarea
                  id="opened_reason"
                  value={openedReason}
                  onChange={(event) => setOpenedReason(event.target.value)}
                  rows={5}
                  placeholder={t('fields.openedReasonPlaceholder')}
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
