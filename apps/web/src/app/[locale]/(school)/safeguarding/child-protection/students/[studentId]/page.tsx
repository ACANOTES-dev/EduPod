'use client';

import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Download,
  FileText,
  FolderLock,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CpRecordType } from '@school/shared/pastoral';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CpRecordSummary {
  id: string;
  student_id: string;
  record_type: CpRecordType;
  narrative_preview: string;
  mandated_report_status: string | null;
  legal_hold: boolean;
  created_at: string;
  logged_by_name: string | null;
}

interface ListResponse {
  data: CpRecordSummary[];
  meta: { page: number; pageSize: number; total: number };
}

interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

const PAGE_SIZE = 20;

const RECORD_TYPE_BADGE: Record<string, string> = {
  concern: 'bg-slate-100 text-slate-700',
  mandated_report: 'bg-amber-100 text-amber-700',
  tusla_correspondence: 'bg-indigo-100 text-indigo-700',
  section_26: 'bg-rose-100 text-rose-700',
  disclosure: 'bg-danger-100 text-danger-700',
  retrospective_disclosure: 'bg-danger-100 text-danger-700',
};

const MR_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-surface-secondary text-text-secondary',
  submitted: 'bg-amber-100 text-amber-700',
  acknowledged: 'bg-info-100 text-info-700',
  outcome_received: 'bg-success-100 text-success-700',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CpRecordsByStudentPage() {
  const t = useTranslations('childProtectionHub.records');
  const params = useParams<{ studentId: string }>();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canView = hasAnyRole(...ADMIN_ROLES);

  const studentId = params?.studentId ?? '';

  const [records, setRecords] = React.useState<CpRecordSummary[]>([]);
  const [total, setTotal] = React.useState(0);
  const [student, setStudent] = React.useState<StudentDetail | null>(null);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!canView || !studentId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const studentPromise = apiClient<{ data: StudentDetail } | StudentDetail>(
      `/api/v1/students/${studentId}`,
    ).then((res) => {
      const unwrapped =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: StudentDetail }).data
          : (res as StudentDetail);
      return unwrapped;
    });

    const recordsPromise = apiClient<ListResponse>(
      `/api/v1/child-protection/cp-records?student_id=${encodeURIComponent(studentId)}&page=${page}&pageSize=${PAGE_SIZE}`,
    );

    void Promise.all([
      studentPromise.catch((err) => {
        console.error('[CpRecordsByStudent] student fetch failed', err);
        return null;
      }),
      recordsPromise,
    ])
      .then(([studentRes, listRes]) => {
        if (cancelled) return;
        setStudent(studentRes);
        setRecords(listRes.data ?? []);
        setTotal(listRes.meta?.total ?? 0);
      })
      .catch((err) => {
        console.error('[CpRecordsByStudent] list failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, page, reloadKey, studentId, t]);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding/child-protection`, label: t('back') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{t('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const studentName = student ? `${student.first_name} ${student.last_name}` : t('title');

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={studentName}
        description={t('description')}
        back={{ href: `/${locale}/safeguarding/child-protection`, label: t('back') }}
        actions={
          <Link
            href={`/${locale}/safeguarding/child-protection/export?student_id=${studentId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <Download className="h-3.5 w-3.5" />
            {t('exportCta')}
          </Link>
        }
      />

      {/* ── Student identity strip ──────────────────────────────────────── */}
      {student && (
        <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 shadow-sm ring-1 ring-inset ring-black/5">
            <UserCircle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-text-primary">{studentName}</p>
            {student.student_number && (
              <p dir="ltr" className="mt-0.5 font-mono text-xs text-text-tertiary">
                {student.student_number}
              </p>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
            <FolderLock className="h-3 w-3" />
            {t('tier3Pill')}
          </span>
        </section>
      )}

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {/* ── Records list ───────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-text-tertiary">
          <span>{t('resultCount', { count: total })}</span>
          <span>{t('pagination', { page, total: totalPages })}</span>
        </header>
        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 4 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-2/3 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="max-w-md text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {records.map((record) => (
              <li key={record.id}>
                <Link
                  href={`/${locale}/safeguarding/child-protection/records/${record.id}`}
                  className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RECORD_TYPE_BADGE[record.record_type] ?? RECORD_TYPE_BADGE.concern}`}
                      >
                        {t(`type.${record.record_type}`)}
                      </span>
                      {record.mandated_report_status && (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MR_STATUS_BADGE[record.mandated_report_status] ?? MR_STATUS_BADGE.draft}`}
                        >
                          {t('mrBadge', {
                            status: t(`mrStatus.${record.mandated_report_status}`),
                          })}
                        </span>
                      )}
                      {record.legal_hold && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger-700">
                          <FolderLock className="h-3 w-3" />
                          {t('legalHold')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-text-primary">
                      {record.narrative_preview}
                    </p>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {new Date(record.created_at).toLocaleDateString(fmtLocale(locale))}
                      {record.logged_by_name ? ` · ${record.logged_by_name}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-50"
            disabled={page === 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ArrowRight className="h-3 w-3 rotate-180 rtl:rotate-0" />
            {t('prev')}
          </button>
          <span className="text-xs text-text-tertiary">
            {t('pagination', { page, total: totalPages })}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-50"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('next')}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
