'use client';

import { Badge, Button } from '@school/ui';
import { Edit3, Eye, FileClock, Link2, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { PastoralSeverityBadge, PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  formatPastoralValue,
  formatShortId,
  getLocaleFromPathname,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralConcernDetail,
} from '@/lib/pastoral';

interface PastoralEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string;
  tier: number;
  created_at: string;
}

export default function PastoralConcernDetailPage() {
  const t = useTranslations('pastoral.concernDetail');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const concernId = params?.id as string;
  const [concern, setConcern] = React.useState<PastoralConcernDetail | null>(null);
  const [events, setEvents] = React.useState<PastoralEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);

    void Promise.allSettled([
      apiClient<PastoralApiDetailResponse<PastoralConcernDetail>>(
        `/api/v1/pastoral/concerns/${concernId}`,
        { silent: true },
      ),
      apiClient<PastoralApiListResponse<PastoralEvent>>(
        `/api/v1/pastoral/concerns/${concernId}/events?page=1&pageSize=10`,
        { silent: true },
      ),
    ])
      .then(([concernResult, eventsResult]) => {
        if (cancelled) {
          return;
        }

        if (concernResult.status === 'fulfilled') {
          setConcern(concernResult.value.data);
        } else {
          setConcern(null);
        }

        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value.data ?? []);
        } else {
          setEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [concernId]);

  const latestVersion = React.useMemo(() => {
    if (!concern?.versions?.length) {
      return null;
    }

    return concern.versions[concern.versions.length - 1];
  }, [concern]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />
      </div>
    );
  }

  if (!concern) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const authorLabel = concern.author_masked_for_viewer
    ? t('authorMasked')
    : (concern.author_name ?? sharedT('notAvailable'));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { id: formatShortId(concern.id) })}
        description={t('description', {
          student: concern.student_name,
          category: formatPastoralValue(concern.category),
        })}
        actions={
          <div className="flex flex-wrap gap-2">
            {!concern.case_id ? (
              <Link href={`/${locale}/pastoral/cases/new?concernId=${concern.id}`}>
                <Button variant="outline">{t('openCase')}</Button>
              </Link>
            ) : null}
            <Link href={`/${locale}/pastoral/concerns/${concern.id}/edit`}>
              <Button>
                <Edit3 className="me-2 h-4 w-4" />
                {t('edit')}
              </Button>
            </Link>
          </div>
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PastoralSeverityBadge severity={concern.severity} />
          <PastoralTierBadge tier={concern.tier} />
          {concern.follow_up_needed ? (
            <Badge className="bg-amber-100 text-amber-900">{t('followUpNeeded')}</Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-700">{t('recordOnly')}</Badge>
          )}
          {concern.case_id ? (
            <Badge className="bg-blue-100 text-blue-800">
              {t('linkedCase', { id: formatShortId(concern.case_id) })}
            </Badge>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('student')}
            </p>
            <p className="mt-2 text-lg font-semibold text-text-primary">{concern.student_name}</p>
            {concern.students_involved.length > 0 ? (
              <div className="mt-3 flex items-start gap-3 text-sm text-text-secondary">
                <Users className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium text-text-primary">{t('studentsInvolved')}</p>
                  <p className="mt-1">
                    {concern.students_involved.map((student) => student.student_name).join(', ')}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('occurredAt')}
                </p>
                <p className="mt-2 text-sm text-text-primary">
                  {formatDateTime(concern.occurred_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('loggedAt')}
                </p>
                <p className="mt-2 text-sm text-text-primary">
                  {formatDateTime(concern.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('reportedBy')}
                </p>
                <p className="mt-2 text-sm text-text-primary">{authorLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('location')}
                </p>
                <p className="mt-2 text-sm text-text-primary">
                  {concern.location || sharedT('notRecorded')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('latestNarrative')}</h2>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
              {latestVersion?.narrative ?? sharedT('notRecorded')}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('responseSummary')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('actionsTaken')}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                  {concern.actions_taken || sharedT('notRecorded')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('followUpSuggestion')}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                  {concern.follow_up_suggestion || sharedT('notRecorded')}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('versionHistory')}</h2>
            <div className="mt-4 space-y-4">
              {concern.versions.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('noVersions')}</p>
              ) : (
                concern.versions.map((version) => (
                  <div key={version.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-text-primary">
                        {t('version', { number: version.version_number })}
                      </p>
                      <span className="text-xs text-text-tertiary">
                        {formatDateTime(version.created_at)}
                      </span>
                    </div>
                    {version.amendment_reason ? (
                      <p className="mt-2 text-xs text-text-tertiary">
                        {t('amendmentReason', { reason: version.amendment_reason })}
                      </p>
                    ) : null}
                    <div className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">
                      {version.narrative}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('recordContext')}</h2>
                <p className="text-sm text-text-secondary">{t('recordContextDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('witnesses')}
                </p>
                <div className="mt-2 space-y-2">
                  {concern.witnesses?.length ? (
                    concern.witnesses.map((witness) => (
                      <div
                        key={`${witness.type}-${witness.id}`}
                        className="rounded-2xl border border-border px-3 py-2 text-sm text-text-secondary"
                      >
                        <span className="font-medium text-text-primary">{witness.name}</span>
                        {' · '}
                        {t(`witnessType.${witness.type}` as never)}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-text-tertiary">{sharedT('notRecorded')}</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('behaviourLink')}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {concern.behaviour_incident_id ? (
                    <span className="inline-flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      {concern.behaviour_incident_id}
                    </span>
                  ) : (
                    sharedT('notRecorded')
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('parentSharing')}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {concern.parent_shareable
                    ? t('shareLevel', {
                        level: formatPastoralValue(concern.parent_share_level ?? 'category_only'),
                      })
                    : t('internalOnly')}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <FileClock className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('chronology')}</h2>
                <p className="text-sm text-text-secondary">{t('chronologyDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-text-tertiary">{t('chronologyUnavailable')}</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-text-primary">
                        {formatPastoralValue(event.event_type)}
                      </p>
                      <span className="text-xs text-text-tertiary">
                        {formatDate(event.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t('timelineMeta', {
                        entity: formatPastoralValue(event.entity_type),
                        tier: event.tier,
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
