'use client';

import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Eye,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import { ErrorBanner } from '../_components/error-banner';

import {
  type OctoberReadinessResponse,
  ReadinessChecklist,
} from './_components/readiness-checklist';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OctoberIssuesResponse {
  academic_year: string;
  total_students: number;
  students_with_issues: number;
  issues: Array<{
    student_id: string;
    student_name: string;
    student_number: string | null;
    problems: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
  }>;
}

interface OctoberPreviewResponse {
  academic_year: string;
  generated_at: string;
  summary: {
    total_students: number;
    gender: { male: number; female: number; other: number };
    nationalities: Array<{ nationality: string; count: number }>;
    year_groups: Array<{ year_group: string; count: number }>;
    new_entrants: number;
  };
}

const DEFAULT_ACADEMIC_YEAR = '2025-2026';

// October returns submission deadline — published by DES each year.
// 2025/26 deadline is 31 October 2025. Used only for the informational KPI tile.
const OCTOBER_DEADLINE_ISO = '2025-10-31';

// ─── Hub tiles ───────────────────────────────────────────────────────────────

interface OctoberTile {
  key: 'issues' | 'preview';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
}

// HubTile prepends the locale — paths here must stay locale-free.
const OCTOBER_TILES: OctoberTile[] = [
  {
    key: 'issues',
    href: '/regulatory/october-returns/issues',
    icon: ClipboardList,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
  },
  {
    key: 'preview',
    href: '/regulatory/october-returns/preview',
    icon: Eye,
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-700',
    glow: 'from-cyan-50/80',
  },
];

// ─── Envelope helper ─────────────────────────────────────────────────────────

function unwrap<T>(res: { data: T } | T): T {
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OctoberReturnsHubPage() {
  const t = useTranslations('regulatory.octoberReturns');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlYear = searchParams?.get('year');
  const [academicYear, setAcademicYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);
  const [draftYear, setDraftYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);

  const [readiness, setReadiness] = React.useState<OctoberReadinessResponse | null>(null);
  const [issues, setIssues] = React.useState<OctoberIssuesResponse | null>(null);
  const [preview, setPreview] = React.useState<OctoberPreviewResponse | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── URL sync for academic year ───────────────────────────────────────────
  React.useEffect(() => {
    const current = searchParams?.get('year');
    if (current === academicYear) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('year', academicYear);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [academicYear, pathname, router, searchParams]);

  // ── Fetch readiness, issues, preview in parallel ─────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    const yearParam = encodeURIComponent(academicYear);

    void Promise.allSettled([
      apiClient<{ data: OctoberReadinessResponse } | OctoberReadinessResponse>(
        `/api/v1/regulatory/october-returns/readiness?academic_year=${yearParam}`,
        { silent: true },
      ),
      apiClient<{ data: OctoberIssuesResponse } | OctoberIssuesResponse>(
        `/api/v1/regulatory/october-returns/issues?academic_year=${yearParam}`,
        { silent: true },
      ),
      apiClient<{ data: OctoberPreviewResponse } | OctoberPreviewResponse>(
        `/api/v1/regulatory/october-returns/preview?academic_year=${yearParam}`,
        { silent: true },
      ),
    ])
      .then(([readinessRes, issuesRes, previewRes]) => {
        if (cancelled) return;

        if (readinessRes.status === 'fulfilled') {
          setReadiness(unwrap(readinessRes.value));
        } else {
          console.error('[OctoberReturnsHubPage] readiness failed', readinessRes.reason);
          setReadiness(null);
        }

        if (issuesRes.status === 'fulfilled') {
          setIssues(unwrap(issuesRes.value));
        } else {
          console.error('[OctoberReturnsHubPage] issues failed', issuesRes.reason);
          setIssues(null);
        }

        if (previewRes.status === 'fulfilled') {
          setPreview(unwrap(previewRes.value));
        } else {
          // Preview may legitimately 404 if no academic year record — this is
          // not a hard error; just hide the preview-timestamp KPI.
          setPreview(null);
        }

        const allFailed =
          readinessRes.status === 'rejected' &&
          issuesRes.status === 'rejected' &&
          previewRes.status === 'rejected';
        if (allFailed) setFetchError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey, t]);

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const { totalStudents, blockingIssues, daysUntilDeadline, previewTimestamp } =
    React.useMemo(() => {
      const total = readiness?.student_count ?? 0;
      const blocking = issues?.students_with_issues ?? 0;

      const now = new Date();
      const deadline = new Date(OCTOBER_DEADLINE_ISO);
      const diffMs = deadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        totalStudents: total,
        blockingIssues: blocking,
        daysUntilDeadline: diffDays,
        previewTimestamp: preview?.generated_at ?? null,
      };
    }, [readiness, issues, preview]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleApplyYear() {
    const trimmed = draftYear.trim();
    if (trimmed && trimmed !== academicYear) setAcademicYear(trimmed);
  }

  function handleYearKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleApplyYear();
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('subHubTitle')}
        description={t('subHubDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          <Link href={`/${locale}/regulatory/october-returns/preview`}>
            <Button className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700">
              <Eye className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('previewSubmissionAction')}
            </Button>
          </Link>
        }
      />

      {fetchError && (
        <ErrorBanner
          message={fetchError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Academic year selector ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="october-academic-year">{t('academicYear')}</Label>
          <Input
            id="october-academic-year"
            value={draftYear}
            onChange={(e) => setDraftYear(e.target.value)}
            onKeyDown={handleYearKeyDown}
            placeholder={t('academicYearPlaceholder')}
            className="w-full text-base sm:w-44"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyYear}
          disabled={isLoading || draftYear.trim() === academicYear}
          className="min-h-[44px]"
        >
          {t('applyYear')}
        </Button>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={Users}
          label={t('kpi.studentsIncluded')}
          value={totalStudents}
          isLoading={isLoading}
          accent="text-teal-700"
          tooltip={t('kpi.studentsIncludedTooltip')}
        />
        <KpiTile
          icon={AlertCircle}
          label={t('kpi.blockingIssues')}
          value={blockingIssues}
          isLoading={isLoading}
          accent={blockingIssues > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.blockingIssuesTooltip')}
        />
        <KpiTile
          icon={CalendarClock}
          label={t('kpi.daysUntilDeadline')}
          value={daysUntilDeadline > 0 ? daysUntilDeadline : t('kpi.deadlinePassed')}
          isLoading={isLoading}
          accent={
            daysUntilDeadline < 0
              ? 'text-danger-600'
              : daysUntilDeadline <= 14
                ? 'text-warning-600'
                : 'text-sky-700'
          }
          tooltip={t('kpi.daysUntilDeadlineTooltip')}
        />
        <KpiTile
          icon={ClipboardCheck}
          label={t('kpi.lastPreview')}
          value={
            previewTimestamp
              ? new Date(previewTimestamp).toLocaleDateString(fmtLocale(locale))
              : t('kpi.never')
          }
          isLoading={isLoading}
          accent="text-cyan-700"
          tooltip={t('kpi.lastPreviewTooltip')}
        />
      </section>

      {/* ── Readiness checklist ────────────────────────────────────────── */}
      <ReadinessChecklist readiness={readiness} isLoading={isLoading} />

      {/* ── Hub tiles ──────────────────────────────────────────────────── */}
      <section aria-label={t('tiles.ariaLabel')} className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {OCTOBER_TILES.map((tile, i) => (
          <HubTile
            key={tile.key}
            icon={tile.icon}
            title={t(`tiles.${tile.key}.title`)}
            description={t(`tiles.${tile.key}.description`)}
            href={tile.href}
            accent={tile.accent}
            iconBg={tile.iconBg}
            glow={tile.glow}
            count={tile.key === 'issues' ? blockingIssues : undefined}
            animationIndex={i}
          />
        ))}
      </section>
    </div>
  );
}
