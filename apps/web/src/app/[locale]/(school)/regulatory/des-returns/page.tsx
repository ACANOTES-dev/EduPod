'use client';

import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileDown,
  FileSpreadsheet,
  History,
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

import { ErrorBanner } from '../_components/error-banner';

import {
  type FileSubmissionInfo,
  ReadinessScorecard,
  type ReadinessResponse,
} from './_components/readiness-scorecard';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SubmissionsApiResponse {
  data: SubmissionRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface SubmissionRow {
  id: string;
  domain: string;
  submission_type: string;
  academic_year: string;
  period_label: string | null;
  status: string;
  submitted_at: string | null;
  record_count: number | null;
  notes: string | null;
  created_at: string;
}

const FILE_KEYS = ['file_a', 'file_c', 'file_d', 'file_e', 'form_tl'] as const;
const DEFAULT_ACADEMIC_YEAR = '2025-2026';
const DES_DOMAIN = 'des_september_returns';

// ─── Tile catalogue ─────────────────────────────────────────────────────────

interface DesTile {
  key: 'subjectMappings' | 'generate' | 'submittedReturns';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
}

// HubTile internally prepends the locale — keep these paths locale-free.
const DES_TILES: DesTile[] = [
  {
    key: 'subjectMappings',
    href: '/regulatory/des-returns/subject-mappings',
    icon: BookOpen,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
  },
  {
    key: 'generate',
    href: '/regulatory/des-returns/generate',
    icon: FileDown,
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-100 text-cyan-700',
    glow: 'from-cyan-50/80',
  },
  {
    key: 'submittedReturns',
    href: `/regulatory/submissions?domain=${DES_DOMAIN}`,
    icon: History,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DesReturnsHubPage() {
  const t = useTranslations('regulatory.desReturns');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlYear = searchParams?.get('year');
  const [academicYear, setAcademicYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);
  const [draftYear, setDraftYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);

  const [readiness, setReadiness] = React.useState<ReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = React.useState(true);
  const [readinessError, setReadinessError] = React.useState<string | null>(null);

  const [submissions, setSubmissions] = React.useState<FileSubmissionInfo[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = React.useState(true);

  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Sync URL when academic year changes ──────────────────────────────────
  React.useEffect(() => {
    const current = searchParams?.get('year');
    if (current === academicYear) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('year', academicYear);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [academicYear, pathname, router, searchParams]);

  // ── Fetch readiness ──────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setReadinessLoading(true);
    setReadinessError(null);

    apiClient<{ data: ReadinessResponse } | ReadinessResponse>(
      `/api/v1/regulatory/des/readiness?academic_year=${encodeURIComponent(academicYear)}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const inner =
          res && typeof res === 'object' && 'data' in (res as object)
            ? (res as { data: ReadinessResponse }).data
            : (res as ReadinessResponse);
        setReadiness(inner);
      })
      .catch((err) => {
        console.error('[DesReturnsHubPage] readiness failed', err);
        if (!cancelled) setReadinessError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey, t]);

  // ── Fetch submissions for last-generated timestamps ──────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setSubmissionsLoading(true);

    apiClient<SubmissionsApiResponse>(
      `/api/v1/regulatory/submissions?domain=${DES_DOMAIN}&academic_year=${encodeURIComponent(academicYear)}&pageSize=100`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const rows = res?.data ?? [];
        const byFile = new Map<string, FileSubmissionInfo>();
        for (const row of rows) {
          const fileType = row.submission_type;
          const when = row.submitted_at ?? row.created_at;
          const prev = byFile.get(fileType);
          if (!prev || (prev.lastGeneratedAt ?? '') < when) {
            byFile.set(fileType, { fileType, lastGeneratedAt: when });
          }
        }
        setSubmissions(Array.from(byFile.values()));
      })
      .catch((err) => {
        console.error('[DesReturnsHubPage] submissions failed', err);
        if (!cancelled) setSubmissions([]);
      })
      .finally(() => {
        if (!cancelled) setSubmissionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey]);

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const { filesReady, filesPending, blockingIssues, lastSubmissionAt } = React.useMemo(() => {
    const categories = readiness?.categories ?? [];
    const blocking = categories.reduce((sum, c) => sum + (c.details?.issues ?? 0), 0);

    const categoryStatus = new Map<string, 'pass' | 'warning' | 'fail'>();
    categories.forEach((c) => categoryStatus.set(c.name, c.status));

    const FILE_DEPS: Record<string, string[]> = {
      file_a: ['staff_data'],
      file_c: ['class_data'],
      file_d: ['subject_mappings'],
      file_e: ['student_data'],
      form_tl: ['schedule_data', 'subject_mappings', 'staff_data'],
    };

    let ready = 0;
    let pending = 0;
    for (const file of FILE_KEYS) {
      const deps = FILE_DEPS[file] ?? [];
      const statuses = deps.map((d) => categoryStatus.get(d) ?? 'fail');
      if (statuses.every((s) => s === 'pass')) ready += 1;
      else pending += 1;
    }

    let last: string | null = null;
    for (const sub of submissions) {
      if (sub.lastGeneratedAt && (!last || sub.lastGeneratedAt > last)) {
        last = sub.lastGeneratedAt;
      }
    }

    return {
      filesReady: ready,
      filesPending: pending,
      blockingIssues: blocking,
      lastSubmissionAt: last,
    };
  }, [readiness, submissions]);

  const isLoading = readinessLoading || submissionsLoading;

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
          <Link href={`/${locale}/regulatory/des-returns/generate`}>
            <Button className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700">
              <FileSpreadsheet className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('generateFilesAction')}
            </Button>
          </Link>
        }
      />

      {readinessError && (
        <ErrorBanner
          message={readinessError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Academic year selector ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="des-academic-year">{t('academicYear')}</Label>
          <Input
            id="des-academic-year"
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
          icon={CheckCircle2}
          label={t('kpi.filesReady')}
          value={filesReady}
          isLoading={isLoading}
          accent="text-teal-700"
          tooltip={t('kpi.filesReadyTooltip')}
        />
        <KpiTile
          icon={Clock}
          label={t('kpi.filesPending')}
          value={filesPending}
          isLoading={isLoading}
          accent={filesPending > 0 ? 'text-warning-600' : 'text-text-tertiary'}
          tooltip={t('kpi.filesPendingTooltip')}
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
          label={t('kpi.lastSubmission')}
          value={
            lastSubmissionAt
              ? new Date(lastSubmissionAt).toLocaleDateString(locale)
              : t('kpi.never')
          }
          isLoading={isLoading}
          accent="text-sky-700"
          tooltip={t('kpi.lastSubmissionTooltip')}
        />
      </section>

      {/* ── Readiness scorecard ────────────────────────────────────────── */}
      <ReadinessScorecard
        readiness={readiness}
        submissions={submissions}
        isLoading={readinessLoading}
      />

      {/* ── Hub tiles ──────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {DES_TILES.map((tile, i) => (
          <HubTile
            key={tile.key}
            icon={tile.icon}
            title={t(`tiles.${tile.key}.title`)}
            description={t(`tiles.${tile.key}.description`)}
            href={tile.href}
            accent={tile.accent}
            iconBg={tile.iconBg}
            glow={tile.glow}
            animationIndex={i}
          />
        ))}
      </section>
    </div>
  );
}
