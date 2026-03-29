'use client';

import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { ArrowUpRight, Link2, ListChecks, Send, Shuffle, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import {
  PastoralCaseStatusBadge,
  PastoralSeverityBadge,
  PastoralTierBadge,
} from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  formatPastoralValue,
  getLocaleFromPathname,
  PASTORAL_CASE_TRANSITIONS,
  searchStaff,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCaseDetail,
  type PastoralConcernListItem,
  type SearchOption,
} from '@/lib/pastoral';

export default function PastoralCaseDetailPage() {
  const t = useTranslations('pastoral.caseDetail');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const caseId = params?.id as string;
  const [caseRecord, setCaseRecord] = React.useState<PastoralCaseDetail | null>(null);
  const [candidateConcerns, setCandidateConcerns] = React.useState<PastoralConcernListItem[]>([]);
  const [nextStatus, setNextStatus] = React.useState('');
  const [statusReason, setStatusReason] = React.useState('');
  const [newOwner, setNewOwner] = React.useState<SearchOption[]>([]);
  const [ownerReason, setOwnerReason] = React.useState('');
  const [studentToAdd, setStudentToAdd] = React.useState<SearchOption[]>([]);
  const [concernToLink, setConcernToLink] = React.useState('none');
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const loadCase = React.useCallback(async () => {
    const response = await apiClient<PastoralApiDetailResponse<PastoralCaseDetail>>(
      `/api/v1/pastoral/cases/${caseId}`,
      { silent: true },
    );
    setCaseRecord(response.data);
    return response.data;
  }, [caseId]);

  const loadCandidateConcerns = React.useCallback(async (detail: PastoralCaseDetail) => {
    const responses = await Promise.allSettled(
      detail.students.map((student) =>
        apiClient<PastoralApiListResponse<PastoralConcernListItem>>(
          `/api/v1/pastoral/concerns?page=1&pageSize=50&student_id=${student.student_id}`,
          { silent: true },
        ),
      ),
    );

    const merged = new Map<string, PastoralConcernListItem>();
    for (const response of responses) {
      if (response.status !== 'fulfilled') {
        continue;
      }

      for (const concern of response.value.data ?? []) {
        if (concern.case_id === null && !merged.has(concern.id)) {
          merged.set(concern.id, concern);
        }
      }
    }

    setCandidateConcerns(Array.from(merged.values()));
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const detail = await loadCase();
      await loadCandidateConcerns(detail);
    } catch {
      setCaseRecord(null);
      setCandidateConcerns([]);
    }
  }, [loadCase, loadCandidateConcerns]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);

    try {
      await action();
      await refresh();
      setStatusReason('');
      setOwnerReason('');
      setNewOwner([]);
      setStudentToAdd([]);
      setConcernToLink('none');
      setNextStatus('');
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  if (!caseRecord) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const allowedTransitions = PASTORAL_CASE_TRANSITIONS[caseRecord.status] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={caseRecord.case_number}
        description={t('description', { student: caseRecord.student_name })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/pastoral/interventions/new?caseId=${caseRecord.id}`}>
              <Button variant="outline">
                <ListChecks className="me-2 h-4 w-4" />
                {t('createIntervention')}
              </Button>
            </Link>
            <Link href={`/${locale}/pastoral/referrals/new?caseId=${caseRecord.id}`}>
              <Button variant="outline">
                <Send className="me-2 h-4 w-4" />
                {t('createReferral')}
              </Button>
            </Link>
          </div>
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PastoralCaseStatusBadge status={caseRecord.status} />
          <PastoralTierBadge tier={caseRecord.tier} />
          {caseRecord.legal_hold ? (
            <Badge className="bg-rose-100 text-rose-800">{t('legalHold')}</Badge>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('primaryStudent')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {caseRecord.student_name}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('owner')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {caseRecord.owner_name ?? sharedT('notAvailable')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('nextReview')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {caseRecord.next_review_date
                ? formatDate(caseRecord.next_review_date)
                : t('reviewNotSet')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('daysOpen')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">{caseRecord.days_open}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('caseSummary')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('openedReason')}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                  {caseRecord.opened_reason}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('openedBy')}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {caseRecord.opened_by_name ?? sharedT('notAvailable')}
                </p>
                <p className="mt-3 text-xs text-text-tertiary">
                  {t('lastUpdated', { date: formatDateTime(caseRecord.updated_at) })}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('linkedConcerns')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('linkedConcernsDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {caseRecord.concerns.map((concern) => (
                <div key={concern.id} className="rounded-2xl border border-border px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PastoralSeverityBadge severity={concern.severity} />
                        <PastoralTierBadge tier={concern.tier} />
                      </div>
                      <p className="mt-3 text-sm font-medium text-text-primary">
                        {formatPastoralValue(concern.category)}
                      </p>
                      {concern.latest_narrative ? (
                        <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                          {concern.latest_narrative}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/${locale}/pastoral/concerns/${concern.id}`}>
                        <Button variant="outline" size="sm">
                          <ArrowUpRight className="me-2 h-4 w-4" />
                          {t('openConcern')}
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyAction === `unlink-${concern.id}`}
                        onClick={() =>
                          void runAction(`unlink-${concern.id}`, async () => {
                            await apiClient(
                              `/api/v1/pastoral/cases/${caseRecord.id}/concerns/${concern.id}`,
                              {
                                method: 'DELETE',
                                silent: true,
                              },
                            );
                          })
                        }
                      >
                        {t('unlinkConcern')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <Label>{t('linkConcern')}</Label>
                  <Select value={concernToLink} onValueChange={setConcernToLink}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('linkConcernPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('noConcernSelected')}</SelectItem>
                      {candidateConcerns.map((concern) => (
                        <SelectItem key={concern.id} value={concern.id}>
                          {concern.student_name}
                          {' · '}
                          {formatPastoralValue(concern.category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={concernToLink === 'none' || busyAction === 'link-concern'}
                    onClick={() =>
                      void runAction('link-concern', async () => {
                        await apiClient(`/api/v1/pastoral/cases/${caseRecord.id}/concerns`, {
                          method: 'POST',
                          body: JSON.stringify({ concern_id: concernToLink }),
                          silent: true,
                        });
                      })
                    }
                  >
                    <Link2 className="me-2 h-4 w-4" />
                    {t('linkConcernAction')}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('students')}</h2>
            <div className="mt-4 space-y-3">
              {caseRecord.students.map((student) => (
                <div
                  key={student.student_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{student.name}</p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {student.is_primary ? t('primaryStudentFlag') : formatDate(student.added_at)}
                    </p>
                  </div>
                  {!student.is_primary ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyAction === `remove-student-${student.student_id}`}
                      onClick={() =>
                        void runAction(`remove-student-${student.student_id}`, async () => {
                          await apiClient(
                            `/api/v1/pastoral/cases/${caseRecord.id}/students/${student.student_id}`,
                            {
                              method: 'DELETE',
                              silent: true,
                            },
                          );
                        })
                      }
                    >
                      {t('removeStudent')}
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-800">
                      {t('primaryStudentFlag')}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <SearchPicker
                label={t('addStudent')}
                placeholder={t('addStudentPlaceholder')}
                search={searchStudents}
                selected={studentToAdd}
                onChange={(next) => setStudentToAdd(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
                disabledIds={caseRecord.students.map((student) => student.student_id)}
              />
              <div className="mt-4 flex justify-end">
                <Button
                  disabled={!studentToAdd[0] || busyAction === 'add-student'}
                  onClick={() =>
                    void runAction('add-student', async () => {
                      await apiClient(`/api/v1/pastoral/cases/${caseRecord.id}/students`, {
                        method: 'POST',
                        body: JSON.stringify({ student_id: studentToAdd[0]?.id }),
                        silent: true,
                      });
                    })
                  }
                >
                  <UserRoundPlus className="me-2 h-4 w-4" />
                  {t('addStudentAction')}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('statusSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{t('nextStatus')}</Label>
                <Select
                  value={nextStatus || 'none'}
                  onValueChange={(value) => setNextStatus(value === 'none' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('nextStatusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('noStatusSelected')}</SelectItem>
                    {allowedTransitions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status_reason">{t('statusReason')}</Label>
                <Textarea
                  id="status_reason"
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  rows={3}
                  placeholder={t('statusReasonPlaceholder')}
                />
              </div>
              <Button
                className="w-full"
                disabled={!nextStatus || !statusReason.trim() || busyAction === 'status'}
                onClick={() =>
                  void runAction('status', async () => {
                    await apiClient(`/api/v1/pastoral/cases/${caseRecord.id}/status`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status: nextStatus, reason: statusReason.trim() }),
                      silent: true,
                    });
                  })
                }
              >
                {t('changeStatus')}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('ownerTransfer')}</h2>
            <div className="mt-4 space-y-4">
              <SearchPicker
                label={t('newOwner')}
                placeholder={t('newOwnerPlaceholder')}
                search={searchStaff}
                selected={newOwner}
                onChange={(next) => setNewOwner(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStaff')}
                minSearchLengthText={sharedT('minSearchLength')}
                disabledIds={[caseRecord.owner_user_id]}
              />
              <div className="space-y-2">
                <Label htmlFor="owner_reason">{t('ownerTransferReason')}</Label>
                <Textarea
                  id="owner_reason"
                  value={ownerReason}
                  onChange={(event) => setOwnerReason(event.target.value)}
                  rows={3}
                  placeholder={t('ownerTransferReasonPlaceholder')}
                />
              </div>
              <Button
                className="w-full"
                disabled={!newOwner[0] || !ownerReason.trim() || busyAction === 'owner'}
                onClick={() =>
                  void runAction('owner', async () => {
                    await apiClient(`/api/v1/pastoral/cases/${caseRecord.id}/transfer`, {
                      method: 'POST',
                      body: JSON.stringify({
                        new_owner_user_id: newOwner[0]?.id,
                        reason: ownerReason.trim(),
                      }),
                      silent: true,
                    });
                  })
                }
              >
                <Shuffle className="me-2 h-4 w-4" />
                {t('transferOwner')}
              </Button>
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
