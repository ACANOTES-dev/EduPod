'use client';

import {
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  HeartHandshake,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, EmptyState, Skeleton, StatusBadge } from '@school/ui';

import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SenStudentProfile {
  id: string;
  student_id: string;
  student_name: string;
  primary_category: string;
  support_level: string;
  sen_categories: string[];
  diagnosis: string | null;
  diagnosis_date: string | null;
  diagnosis_source: string | null;
  assessment_notes: string | null;
  is_active: boolean;
  flagged_date: string | null;
  sen_coordinator_name: string | null;
  student_year_group: string | null;
}

interface SenPlan {
  id: string;
  plan_number: string;
  status: string;
  academic_year: string;
  start_date: string;
  review_date: string | null;
}

interface ResourceAllocation {
  id: string;
  resource_type: string;
  allocated_hours: number;
  used_hours: number;
  provider_name: string | null;
  period_label: string;
}

interface ProfessionalInvolvement {
  id: string;
  professional_name: string;
  role: string;
  organisation: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
}

interface Accommodation {
  id: string;
  accommodation_type: string;
  description: string;
  is_active: boolean;
  applied_date: string | null;
}

interface TransitionNote {
  id: string;
  note_type: string;
  content: string;
  created_at: string;
  author_name: string;
}

// ─── Status variant map ──────────────────────────────────────────────────────

const STATUS_VARIANT_MAP: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  draft: 'info',
  under_review: 'warning',
  closed: 'neutral',
  archived: 'neutral',
};

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  profile,
  t,
}: {
  profile: SenStudentProfile;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Core details */}
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('profile.coreDetails')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('profile.primaryCategory')}</dt>
              <dd className="font-medium text-text-primary">
                {t(`category.${profile.primary_category}`)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('profile.supportLevel')}</dt>
              <dd className="font-medium text-text-primary">
                {t(`supportLevel.${profile.support_level}`)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('profile.coordinator')}</dt>
              <dd className="font-medium text-text-primary">
                {profile.sen_coordinator_name ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('profile.flaggedDate')}</dt>
              <dd className="font-medium text-text-primary">
                {profile.flagged_date ? new Date(profile.flagged_date).toLocaleDateString() : '—'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Additional categories */}
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('profile.categories')}</h3>
          {profile.sen_categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.sen_categories.map((cat) => (
                <Badge key={cat} variant="secondary">
                  {t(`category.${cat}`)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">{t('profile.noAdditionalCategories')}</p>
          )}
        </div>
      </div>

      {/* Diagnosis — only shown when backend returns data (permission-gated) */}
      {profile.diagnosis && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('profile.diagnosis')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t('profile.diagnosisName')}</dt>
              <dd className="font-medium text-text-primary">{profile.diagnosis}</dd>
            </div>
            {profile.diagnosis_date && (
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t('profile.diagnosisDate')}</dt>
                <dd className="font-medium text-text-primary">
                  {new Date(profile.diagnosis_date).toLocaleDateString()}
                </dd>
              </div>
            )}
            {profile.diagnosis_source && (
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t('profile.diagnosisSource')}</dt>
                <dd className="font-medium text-text-primary">{profile.diagnosis_source}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Assessment notes */}
      {profile.assessment_notes && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('profile.assessmentNotes')}
          </h3>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">
            {profile.assessment_notes}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Plans tab ────────────────────────────────────────────────────────────────

function PlansTab({
  profileId,
  t,
}: {
  profileId: string;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [plans, setPlans] = React.useState<SenPlan[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: SenPlan[] }>(`/api/v1/sen/profiles/${profileId}/plans`)
      .then((res) => {
        if (!cancelled) setPlans(res.data);
      })
      .catch((err) => {
        console.error('[PlansTab] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`plan-skel-${i}`} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('plans.empty')}
        description={t('plans.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => router.push(`/${locale}/sen/plans/${plan.id}`)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{plan.plan_number}</span>
              <StatusBadge status={STATUS_VARIANT_MAP[plan.status] ?? 'neutral'}>
                {t(`planStatus.${plan.status}`)}
              </StatusBadge>
            </div>
            <p className="text-xs text-text-secondary">
              {plan.academic_year} &middot; {new Date(plan.start_date).toLocaleDateString()}
              {plan.review_date && ` — ${new Date(plan.review_date).toLocaleDateString()}`}
            </p>
          </div>
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
        </button>
      ))}
    </div>
  );
}

// ─── Resources tab ────────────────────────────────────────────────────────────

function ResourcesTab({
  profileId,
  t,
}: {
  profileId: string;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  const [allocations, setAllocations] = React.useState<ResourceAllocation[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: ResourceAllocation[] }>(
      `/api/v1/sen/student-hours?sen_profile_id=${profileId}`,
    )
      .then((res) => {
        if (!cancelled) setAllocations(res.data);
      })
      .catch((err) => {
        console.error('[ResourcesTab] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`res-skel-${i}`} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (allocations.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t('resources.empty')}
        description={t('resources.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {allocations.map((alloc) => {
        const pct =
          alloc.allocated_hours > 0
            ? Math.round((alloc.used_hours / alloc.allocated_hours) * 100)
            : 0;
        return (
          <div key={alloc.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">{alloc.resource_type}</span>
              <span className="text-xs text-text-secondary">{alloc.period_label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-text-secondary">
                {alloc.used_hours}/{alloc.allocated_hours}h ({pct}%)
              </span>
            </div>
            {alloc.provider_name && (
              <p className="text-xs text-text-tertiary">
                {t('resources.provider')}: {alloc.provider_name}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Professionals tab ────────────────────────────────────────────────────────

function ProfessionalsTab({
  profileId,
  t,
}: {
  profileId: string;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  const [professionals, setProfessionals] = React.useState<ProfessionalInvolvement[]>([]);
  const [restrictedCount, setRestrictedCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data?: ProfessionalInvolvement[]; count?: number }>(
      `/api/v1/sen/profiles/${profileId}/professionals`,
    )
      .then((res) => {
        if (!cancelled) {
          if (res.data) {
            setProfessionals(res.data);
          } else if (typeof res.count === 'number') {
            setRestrictedCount(res.count);
          }
        }
      })
      .catch((err) => {
        console.error('[ProfessionalsTab] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={`prof-skel-${i}`} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  // Permission-gated: backend returns count only
  if (restrictedCount !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-surface-secondary p-4">
          <Lock className="h-8 w-8 text-text-tertiary" />
        </div>
        <p className="text-sm font-medium text-text-primary">{t('professionals.restricted')}</p>
        <p className="text-sm text-text-secondary">
          {t('professionals.restrictedCount', { count: restrictedCount })}
        </p>
      </div>
    );
  }

  if (professionals.length === 0) {
    return (
      <EmptyState
        icon={User}
        title={t('professionals.empty')}
        description={t('professionals.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {professionals.map((prof) => (
        <div key={prof.id} className="rounded-xl border border-border bg-surface p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">{prof.professional_name}</span>
            <Badge variant="secondary">{prof.role}</Badge>
          </div>
          {prof.organisation && <p className="text-xs text-text-secondary">{prof.organisation}</p>}
          <p className="text-xs text-text-tertiary">
            {new Date(prof.start_date).toLocaleDateString()}
            {prof.end_date
              ? ` — ${new Date(prof.end_date).toLocaleDateString()}`
              : ` — ${t('professionals.ongoing')}`}
          </p>
          {prof.notes && <p className="text-xs text-text-secondary mt-1">{prof.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Accommodations tab ───────────────────────────────────────────────────────

function AccommodationsTab({
  profileId,
  t,
}: {
  profileId: string;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  const [accommodations, setAccommodations] = React.useState<Accommodation[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: Accommodation[] }>(`/api/v1/sen/profiles/${profileId}/accommodations`)
      .then((res) => {
        if (!cancelled) setAccommodations(res.data);
      })
      .catch((err) => {
        console.error('[AccommodationsTab] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`acc-skel-${i}`} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (accommodations.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t('accommodations.empty')}
        description={t('accommodations.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {accommodations.map((acc) => (
        <div key={acc.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{acc.accommodation_type}</Badge>
              <StatusBadge status={acc.is_active ? 'success' : 'neutral'}>
                {acc.is_active ? t('accommodations.active') : t('accommodations.inactive')}
              </StatusBadge>
            </div>
            {acc.applied_date && (
              <span className="text-xs text-text-tertiary">
                {new Date(acc.applied_date).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary">{acc.description}</p>
        </div>
      ))}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({
  profileId,
  t,
}: {
  profileId: string;
  t: ReturnType<typeof useTranslations<'sen'>>;
}) {
  const [notes, setNotes] = React.useState<TransitionNote[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ data: TransitionNote[] }>(`/api/v1/sen/profiles/${profileId}/transition-notes`)
      .then((res) => {
        if (!cancelled) {
          const sorted = [...res.data].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          setNotes(sorted);
        }
      })
      .catch((err) => {
        console.error('[HistoryTab] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`hist-skel-${i}`} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={t('history.empty')}
        description={t('history.emptyDescription')}
      />
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Timeline line */}
      <div className="absolute start-4 top-0 bottom-0 w-px bg-border" />

      {notes.map((note) => (
        <div key={note.id} className="relative flex gap-4 pb-6">
          {/* Timeline dot */}
          <div className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-surface" />

          <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-4 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{note.note_type}</Badge>
              <span className="text-xs text-text-tertiary">
                {new Date(note.created_at).toLocaleDateString()}
              </span>
              <span className="text-xs text-text-secondary">{note.author_name}</span>
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{note.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SenStudentProfilePage() {
  const t = useTranslations('sen');
  const params = useParams<{ studentId: string }>();
  const studentId = params?.studentId ?? '';

  const [profile, setProfile] = React.useState<SenStudentProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    apiClient<{ data: SenStudentProfile }>(`/api/v1/sen/students/${studentId}/profile`)
      .then((res) => {
        if (!cancelled) setProfile(res.data);
      })
      .catch((err) => {
        console.error('[SenStudentProfilePage] fetch', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={HeartHandshake}
        title={t('profile.notFound')}
        description={t('profile.notFoundDescription')}
      />
    );
  }

  const tabs = [
    {
      key: 'profile',
      label: t('tabs.profile'),
      content: <ProfileTab profile={profile} t={t} />,
    },
    {
      key: 'plans',
      label: t('tabs.plans'),
      content: <PlansTab profileId={profile.id} t={t} />,
    },
    {
      key: 'resources',
      label: t('tabs.resources'),
      content: <ResourcesTab profileId={profile.id} t={t} />,
    },
    {
      key: 'professionals',
      label: t('tabs.professionals'),
      content: <ProfessionalsTab profileId={profile.id} t={t} />,
    },
    {
      key: 'accommodations',
      label: t('tabs.accommodations'),
      content: <AccommodationsTab profileId={profile.id} t={t} />,
    },
    {
      key: 'history',
      label: t('tabs.history'),
      content: <HistoryTab profileId={profile.id} t={t} />,
    },
  ];

  return (
    <RecordHub
      title={profile.student_name}
      subtitle={profile.student_year_group ?? undefined}
      status={{
        label: profile.is_active ? t('status.active') : t('status.inactive'),
        variant: profile.is_active ? 'success' : 'neutral',
      }}
      reference={profile.id}
      tabs={tabs}
    />
  );
}
