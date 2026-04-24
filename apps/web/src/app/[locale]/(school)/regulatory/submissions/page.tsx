'use client';

import { AlertCircle, CheckCircle2, Clock, FileBarChart2, Hash } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared/regulatory';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import { ErrorBanner } from '../_components/error-banner';

import { SubmissionDetailDrawer, type SubmissionRow } from './_components/submission-detail-drawer';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubmissionsApiResponse {
  data: SubmissionRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface SummaryResult {
  total: number;
  submitted: number;
  pending: number;
  failed: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  reg_not_started: 'neutral',
  not_started: 'neutral',
  reg_in_progress: 'info',
  in_progress: 'info',
  ready_for_review: 'warning',
  reg_submitted: 'success',
  submitted: 'success',
  reg_accepted: 'success',
  accepted: 'success',
  reg_rejected: 'danger',
  rejected: 'danger',
  overdue: 'danger',
};

function normaliseStatus(status: string): string {
  return status.startsWith('reg_') ? status.slice(4) : status;
}

function statusKey(status: string): string {
  const n = normaliseStatus(status);
  const map: Record<string, string> = {
    not_started: 'notStarted',
    in_progress: 'inProgress',
    ready_for_review: 'readyForReview',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    overdue: 'overdue',
  };
  return map[n] ?? n;
}

function getDomainLabel(domain: string): string {
  const entry = REGULATORY_DOMAINS[domain as keyof typeof REGULATORY_DOMAINS];
  return entry?.label ?? domain;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(fmtLocale(locale, 'en-IE'), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RegulatorySubmissionsPage() {
  const t = useTranslations('regulatory.submissions');
  const statusT = useTranslations('regulatory.status');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_owner', 'school_principal', 'admin');

  const urlDomain = searchParams?.get('domain');
  const urlStatus = searchParams?.get('status');
  const urlYear = searchParams?.get('year');

  const [domain, setDomain] = React.useState(
    urlDomain && urlDomain in REGULATORY_DOMAINS ? urlDomain : 'all',
  );
  const [status, setStatus] = React.useState(urlStatus ?? 'all');
  const [academicYear, setAcademicYear] = React.useState(urlYear ?? '');
  const [draftYear, setDraftYear] = React.useState(urlYear ?? '');
  const [submissions, setSubmissions] = React.useState<SubmissionRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState<SummaryResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  // ── Keep URL in sync with filters ─────────────────────────────────────────
  React.useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    if (domain !== 'all') params.set('domain', domain);
    if (status !== 'all') params.set('status', status);
    if (academicYear) params.set('year', academicYear);
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    const currentQs = searchParams?.toString() ?? '';
    if (currentQs !== qs) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [domain, status, academicYear, pathname, router, searchParams]);

  // ── Fetch paginated list ──────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (domain !== 'all') params.set('domain', domain);
    if (status !== 'all') params.set('status', status);
    if (academicYear) params.set('academic_year', academicYear);

    apiClient<SubmissionsApiResponse>(`/api/v1/regulatory/submissions?${params.toString()}`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setSubmissions(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[RegulatorySubmissionsPage] fetch', err);
        setSubmissions([]);
        setTotal(0);
        setFetchError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, domain, status, academicYear, reloadKey, t]);

  // ── Fetch year-wide summary (unfiltered by status) ───────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (academicYear) params.set('academic_year', academicYear);
    apiClient<SubmissionsApiResponse>(`/api/v1/regulatory/submissions?${params.toString()}`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        const all = res.data ?? [];
        let submitted = 0;
        let pending = 0;
        let failed = 0;
        for (const row of all) {
          const n = normaliseStatus(row.status);
          if (n === 'submitted' || n === 'accepted') submitted += 1;
          else if (n === 'rejected' || n === 'overdue') failed += 1;
          else pending += 1;
        }
        setSummary({ total: all.length, submitted, pending, failed });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[RegulatorySubmissionsPage] summary', err);
        setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey]);

  function applyYear() {
    const trimmed = draftYear.trim();
    if (trimmed !== academicYear) {
      setAcademicYear(trimmed);
      setPage(1);
    }
  }

  function openDetail(row: SubmissionRow) {
    setSelectedId(row.id);
    setDetailOpen(true);
  }

  const columns = React.useMemo(
    () => [
      {
        key: 'domain',
        header: t('domain'),
        render: (row: SubmissionRow) => (
          <span className="text-sm font-medium text-text-primary">
            {getDomainLabel(row.domain)}
          </span>
        ),
      },
      {
        key: 'submission_type',
        header: t('type'),
        render: (row: SubmissionRow) => (
          <span className="text-sm text-text-secondary">
            {row.submission_type}
            {row.period_label && (
              <span className="ms-1.5 text-text-tertiary">· {row.period_label}</span>
            )}
          </span>
        ),
      },
      {
        key: 'academic_year',
        header: t('academicYear'),
        render: (row: SubmissionRow) => (
          <span className="text-sm tabular-nums text-text-secondary">{row.academic_year}</span>
        ),
      },
      {
        key: 'status',
        header: t('status'),
        render: (row: SubmissionRow) => (
          <StatusBadge status={STATUS_VARIANT[row.status] ?? 'neutral'} dot>
            {statusT(statusKey(row.status) as never)}
          </StatusBadge>
        ),
      },
      {
        key: 'submitted_at',
        header: t('submittedAt'),
        render: (row: SubmissionRow) => (
          <span className="text-sm tabular-nums text-text-secondary">
            {formatDate(row.submitted_at, locale)}
          </span>
        ),
      },
      {
        key: 'record_count',
        header: t('recordCount'),
        render: (row: SubmissionRow) => (
          <span className="text-sm tabular-nums text-text-secondary">
            {row.record_count ?? '—'}
          </span>
        ),
      },
    ],
    [locale, t, statusT],
  );

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
      />

      {fetchError && (
        <ErrorBanner
          message={fetchError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={FileBarChart2}
          label={t('kpi.totalThisYear')}
          value={summary?.total ?? 0}
          isLoading={isLoading && !summary}
          accent="text-teal-700"
          tooltip={t('kpi.totalThisYearTooltip')}
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.submitted')}
          value={summary?.submitted ?? 0}
          isLoading={isLoading && !summary}
          accent="text-success-700"
        />
        <KpiTile
          icon={Clock}
          label={t('kpi.pending')}
          value={summary?.pending ?? 0}
          isLoading={isLoading && !summary}
          accent={(summary?.pending ?? 0) > 0 ? 'text-warning-700' : 'text-text-tertiary'}
        />
        <KpiTile
          icon={AlertCircle}
          label={t('kpi.failed')}
          value={summary?.failed ?? 0}
          isLoading={isLoading && !summary}
          accent={(summary?.failed ?? 0) > 0 ? 'text-danger-600' : 'text-text-tertiary'}
        />
      </section>

      {/* ── Filters section ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface-primary p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-domain">{t('domain')}</Label>
          <Select
            value={domain}
            onValueChange={(v) => {
              setDomain(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="sub-domain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allDomains')}</SelectItem>
              {Object.entries(REGULATORY_DOMAINS).map(([key, val]) => (
                <SelectItem key={key} value={key}>
                  {val.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-status">{t('status')}</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="sub-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              <SelectItem value="not_started">{statusT('notStarted')}</SelectItem>
              <SelectItem value="in_progress">{statusT('inProgress')}</SelectItem>
              <SelectItem value="ready_for_review">{statusT('readyForReview')}</SelectItem>
              <SelectItem value="submitted">{statusT('submitted')}</SelectItem>
              <SelectItem value="accepted">{statusT('accepted')}</SelectItem>
              <SelectItem value="rejected">{statusT('rejected')}</SelectItem>
              <SelectItem value="overdue">{statusT('overdue')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-year">{t('academicYear')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="sub-year"
              value={draftYear}
              onChange={(e) => setDraftYear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyYear();
              }}
              onBlur={applyYear}
              placeholder={t('academicYearPlaceholder')}
            />
          </div>
        </div>
      </div>

      {/* ── Results table ──────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={submissions}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
          onRowClick={openDetail}
        />
      </div>

      {/* ── Mobile cards ───────────────────────────────────────────────── */}
      <div className="space-y-2 md:hidden">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-border bg-surface-secondary"
            />
          ))
        ) : submissions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-tertiary">
            {t('noSubmissions')}
          </p>
        ) : (
          submissions.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => openDetail(row)}
              className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-surface-primary p-4 text-start transition-colors hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {getDomainLabel(row.domain)}
                </span>
                <StatusBadge status={STATUS_VARIANT[row.status] ?? 'neutral'} dot>
                  {statusT(statusKey(row.status) as never)}
                </StatusBadge>
              </div>
              <p className="text-sm text-text-secondary">
                {row.submission_type}
                {row.period_label ? ` · ${row.period_label}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span className="tabular-nums">{row.academic_year}</span>
                <span>·</span>
                <span className="tabular-nums">{formatDate(row.submitted_at, locale)}</span>
                {row.record_count !== null && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Hash className="h-3 w-3" aria-hidden="true" />
                      {row.record_count}
                    </span>
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <SubmissionDetailDrawer
        submissionId={selectedId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => setReloadKey((k) => k + 1)}
        canManage={canManage}
      />
    </div>
  );
}
