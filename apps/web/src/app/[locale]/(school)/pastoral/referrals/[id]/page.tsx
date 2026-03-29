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
import { RefreshCw, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import {
  PastoralRecommendationStatusBadge,
  PastoralReferralStatusBadge,
} from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  formatStudentName,
  getLocaleFromPathname,
  PASTORAL_RECOMMENDATION_STATUSES,
  searchStaff,
  type PastoralApiDetailResponse,
  type PastoralReferralDetail,
  type SearchOption,
} from '@/lib/pastoral';

function prettyJson(value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return '';
  }

  return JSON.stringify(value, null, 2);
}

function parseObjectJson(value: string): Record<string, unknown> | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected object JSON');
  }

  return parsed as Record<string, unknown>;
}

export default function PastoralReferralDetailPage() {
  const t = useTranslations('pastoral.referralDetail');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const referralId = params?.id as string;
  const [referral, setReferral] = React.useState<PastoralReferralDetail | null>(null);
  const [referralBodyName, setReferralBodyName] = React.useState('');
  const [externalReference, setExternalReference] = React.useState('');
  const [reportSummary, setReportSummary] = React.useState('');
  const [prePopulatedText, setPrePopulatedText] = React.useState('');
  const [manualAdditionsText, setManualAdditionsText] = React.useState('');
  const [assessmentDate, setAssessmentDate] = React.useState('');
  const [withdrawReason, setWithdrawReason] = React.useState('');
  const [newRecommendation, setNewRecommendation] = React.useState('');
  const [recommendationOwner, setRecommendationOwner] = React.useState<SearchOption[]>([]);
  const [recommendationReviewDate, setRecommendationReviewDate] = React.useState('');
  const [recommendationStatus, setRecommendationStatus] = React.useState<Record<string, string>>(
    {},
  );
  const [recommendationNote, setRecommendationNote] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const populateForm = React.useCallback((detail: PastoralReferralDetail) => {
    setReferralBodyName(detail.referral_body_name ?? '');
    setExternalReference(detail.external_reference ?? '');
    setReportSummary(detail.report_summary ?? '');
    setPrePopulatedText(prettyJson(detail.pre_populated_data));
    setManualAdditionsText(prettyJson(detail.manual_additions));
    setRecommendationStatus(
      Object.fromEntries(detail.recommendations.map((item) => [item.id, item.status])),
    );
    setRecommendationNote(
      Object.fromEntries(detail.recommendations.map((item) => [item.id, item.status_note ?? ''])),
    );
  }, []);

  const refresh = React.useCallback(async () => {
    const response = await apiClient<PastoralApiDetailResponse<PastoralReferralDetail>>(
      `/api/v1/pastoral/referrals/${referralId}`,
      { silent: true },
    );

    setReferral(response.data);
    populateForm(response.data);
  }, [populateForm, referralId]);

  React.useEffect(() => {
    void refresh().catch(() => {
      setReferral(null);
    });
  }, [refresh]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);

    try {
      await action();
      await refresh();
      setAssessmentDate('');
      setWithdrawReason('');
      setNewRecommendation('');
      setRecommendationOwner([]);
      setRecommendationReviewDate('');
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  if (!referral) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const status = referral.status;
  const isDraft = status === 'draft';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', {
          student: formatStudentName(referral.student) || sharedT('notAvailable'),
        })}
        description={t('description', { type: t(`types.${referral.referral_type}` as never) })}
        actions={
          referral.case ? (
            <Link href={`/${locale}/pastoral/cases/${referral.case.id}`}>
              <Button variant="outline">{t('openCase')}</Button>
            </Link>
          ) : null
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PastoralReferralStatusBadge status={status} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('student')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatStudentName(referral.student) || sharedT('notAvailable')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('type')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {t(`types.${referral.referral_type}` as never)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('submitted')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {referral.submitted_at ? formatDateTime(referral.submitted_at) : t('draftOnly')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('assessmentDate')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {referral.assessment_scheduled_date
                ? formatDate(referral.assessment_scheduled_date)
                : sharedT('notRecorded')}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('draftSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('draftDescription')}</p>
              </div>
              {!isDraft ? <p className="text-sm text-text-tertiary">{t('draftLocked')}</p> : null}
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="referral_body_name">{t('fields.referralBodyName')}</Label>
                  <Input
                    id="referral_body_name"
                    value={referralBodyName}
                    onChange={(event) => setReferralBodyName(event.target.value)}
                    readOnly={!isDraft}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="external_reference">{t('fields.externalReference')}</Label>
                  <Input
                    id="external_reference"
                    value={externalReference}
                    onChange={(event) => setExternalReference(event.target.value)}
                    readOnly={!isDraft}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prepopulated">{t('fields.prePopulatedData')}</Label>
                <Textarea
                  id="prepopulated"
                  value={prePopulatedText}
                  onChange={(event) => setPrePopulatedText(event.target.value)}
                  rows={8}
                  readOnly={!isDraft}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual_additions">{t('fields.manualAdditions')}</Label>
                <Textarea
                  id="manual_additions"
                  value={manualAdditionsText}
                  onChange={(event) => setManualAdditionsText(event.target.value)}
                  rows={8}
                  readOnly={!isDraft}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="report_summary">{t('fields.reportSummary')}</Label>
                <Textarea
                  id="report_summary"
                  value={reportSummary}
                  onChange={(event) => setReportSummary(event.target.value)}
                  rows={5}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!isDraft || busyAction === 'prepopulate'}
                  onClick={() =>
                    void runAction('prepopulate', async () => {
                      const snapshot = await apiClient<Record<string, unknown>>(
                        `/api/v1/pastoral/referrals/${referral.id}/pre-populate`,
                        {
                          method: 'POST',
                          silent: true,
                        },
                      );

                      const nextSnapshot = snapshot as Record<string, unknown>;
                      setPrePopulatedText(JSON.stringify(nextSnapshot, null, 2));

                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          pre_populated_data: nextSnapshot,
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  <RefreshCw className="me-2 h-4 w-4" />
                  {t('prePopulate')}
                </Button>
                <Button
                  type="button"
                  disabled={!isDraft || busyAction === 'save-draft'}
                  onClick={() =>
                    void runAction('save-draft', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          referral_body_name: referralBodyName.trim() || undefined,
                          external_reference: externalReference.trim() || undefined,
                          report_summary: reportSummary.trim() || undefined,
                          pre_populated_data: parseObjectJson(prePopulatedText),
                          manual_additions: parseObjectJson(manualAdditionsText),
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  <Save className="me-2 h-4 w-4" />
                  {t('saveDraft')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('recommendationsSection')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('recommendationsDescription')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {referral.recommendations.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noRecommendations')}
                </p>
              ) : (
                referral.recommendations.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            {item.recommendation}
                          </p>
                          <p className="mt-1 text-xs text-text-tertiary">
                            {item.review_date
                              ? formatDate(item.review_date)
                              : sharedT('notRecorded')}
                          </p>
                        </div>
                        <PastoralRecommendationStatusBadge
                          status={recommendationStatus[item.id] ?? item.status}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <Label>{t('fields.recommendationStatus')}</Label>
                          <Select
                            value={recommendationStatus[item.id] ?? item.status}
                            onValueChange={(value) =>
                              setRecommendationStatus((current) => ({
                                ...current,
                                [item.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PASTORAL_RECOMMENDATION_STATUSES.map((statusOption) => (
                                <SelectItem key={statusOption} value={statusOption}>
                                  {t(`recommendationStatus.${statusOption}` as never)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('fields.recommendationNote')}</Label>
                          <Textarea
                            value={recommendationNote[item.id] ?? ''}
                            onChange={(event) =>
                              setRecommendationNote((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            rows={3}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            disabled={busyAction === `recommendation-${item.id}`}
                            onClick={() =>
                              void runAction(`recommendation-${item.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/referrals/${referral.id}/recommendations/${item.id}`,
                                  {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                      status: recommendationStatus[item.id] ?? item.status,
                                      status_note: recommendationNote[item.id] ?? '',
                                    }),
                                    silent: true,
                                  },
                                );
                              })
                            }
                          >
                            {t('saveRecommendation')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="recommendation">{t('fields.newRecommendation')}</Label>
                  <Textarea
                    id="recommendation"
                    value={newRecommendation}
                    onChange={(event) => setNewRecommendation(event.target.value)}
                    rows={3}
                    placeholder={t('fields.newRecommendationPlaceholder')}
                  />
                </div>

                <SearchPicker
                  label={t('fields.recommendationOwner')}
                  placeholder={t('fields.recommendationOwnerPlaceholder')}
                  search={searchStaff}
                  selected={recommendationOwner}
                  onChange={(next) => setRecommendationOwner(next.slice(0, 1))}
                  multiple={false}
                  emptyText={sharedT('noStaff')}
                  minSearchLengthText={sharedT('minSearchLength')}
                />

                <div className="space-y-2">
                  <Label htmlFor="recommendation_review_date">
                    {t('fields.recommendationReviewDate')}
                  </Label>
                  <Input
                    id="recommendation_review_date"
                    type="date"
                    value={recommendationReviewDate}
                    onChange={(event) => setRecommendationReviewDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={!newRecommendation.trim() || busyAction === 'create-recommendation'}
                  onClick={() =>
                    void runAction('create-recommendation', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}/recommendations`, {
                        method: 'POST',
                        body: JSON.stringify({
                          referral_id: referral.id,
                          recommendation: newRecommendation.trim(),
                          assigned_to_user_id: recommendationOwner[0]?.id,
                          review_date: recommendationReviewDate || undefined,
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  {t('createRecommendation')}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('workflowSection')}</h2>
            <div className="mt-4 space-y-4">
              {status === 'draft' ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={busyAction === 'submit'}
                  onClick={() =>
                    void runAction('submit', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}/submit`, {
                        method: 'POST',
                        silent: true,
                      });
                    })
                  }
                >
                  {t('submitReferral')}
                </Button>
              ) : null}

              {status === 'submitted' ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={busyAction === 'acknowledge'}
                  onClick={() =>
                    void runAction('acknowledge', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}/acknowledge`, {
                        method: 'POST',
                        silent: true,
                      });
                    })
                  }
                >
                  {t('acknowledge')}
                </Button>
              ) : null}

              {status === 'acknowledged' ? (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-secondary/60 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="assessment_date">{t('fields.assessmentDate')}</Label>
                    <Input
                      id="assessment_date"
                      type="date"
                      value={assessmentDate}
                      onChange={(event) => setAssessmentDate(event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!assessmentDate || busyAction === 'schedule'}
                    onClick={() =>
                      void runAction('schedule', async () => {
                        await apiClient(
                          `/api/v1/pastoral/referrals/${referral.id}/schedule-assessment`,
                          {
                            method: 'POST',
                            body: JSON.stringify({ assessment_scheduled_date: assessmentDate }),
                            silent: true,
                          },
                        );
                      })
                    }
                  >
                    {t('scheduleAssessment')}
                  </Button>
                </div>
              ) : null}

              {status === 'assessment_scheduled' ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={busyAction === 'complete-assessment'}
                  onClick={() =>
                    void runAction('complete-assessment', async () => {
                      await apiClient(
                        `/api/v1/pastoral/referrals/${referral.id}/complete-assessment`,
                        {
                          method: 'POST',
                          silent: true,
                        },
                      );
                    })
                  }
                >
                  {t('completeAssessment')}
                </Button>
              ) : null}

              {status === 'assessment_complete' ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={!reportSummary.trim() || busyAction === 'receive-report'}
                  onClick={() =>
                    void runAction('receive-report', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}/receive-report`, {
                        method: 'POST',
                        body: JSON.stringify({ report_summary: reportSummary.trim() }),
                        silent: true,
                      });
                    })
                  }
                >
                  {t('receiveReport')}
                </Button>
              ) : null}

              {status === 'report_received' ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={busyAction === 'complete'}
                  onClick={() =>
                    void runAction('complete', async () => {
                      await apiClient(`/api/v1/pastoral/referrals/${referral.id}/complete`, {
                        method: 'POST',
                        silent: true,
                      });
                    })
                  }
                >
                  {t('markComplete')}
                </Button>
              ) : null}

              {!['recommendations_implemented', 'withdrawn'].includes(status) ? (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-secondary/60 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="withdraw_reason">{t('fields.withdrawReason')}</Label>
                    <Textarea
                      id="withdraw_reason"
                      value={withdrawReason}
                      onChange={(event) => setWithdrawReason(event.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={withdrawReason.trim().length < 5 || busyAction === 'withdraw'}
                    onClick={() =>
                      void runAction('withdraw', async () => {
                        await apiClient(`/api/v1/pastoral/referrals/${referral.id}/withdraw`, {
                          method: 'POST',
                          body: JSON.stringify({ reason: withdrawReason.trim() }),
                          silent: true,
                        });
                      })
                    }
                  >
                    {t('withdraw')}
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          {error ? (
            <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
