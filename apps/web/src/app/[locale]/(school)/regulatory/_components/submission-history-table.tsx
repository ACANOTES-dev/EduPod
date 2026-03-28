'use client';

import { REGULATORY_DOMAINS } from '@school/shared';
import { StatusBadge } from '@school/ui';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Submission {
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

interface SubmissionHistoryTableProps {
  data: Submission[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  toolbar?: React.ReactNode;
}

// ─── Status variant mapping ───────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  not_started: 'neutral',
  in_progress: 'info',
  ready_for_review: 'warning',
  submitted: 'success',
  accepted: 'success',
  rejected: 'danger',
  overdue: 'danger',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocaleFromPathname(pathname: string): string {
  const segments = pathname.split('/');
  return segments[1] === 'ar' ? 'ar' : 'en';
}

function formatDateLocale(dateStr: string | null, locale: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDomainLabel(domain: string): string {
  const entry = REGULATORY_DOMAINS[domain as keyof typeof REGULATORY_DOMAINS];
  return entry?.label ?? domain;
}

function getStatusKey(status: string): string {
  const map: Record<string, string> = {
    not_started: 'notStarted',
    in_progress: 'inProgress',
    ready_for_review: 'readyForReview',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    overdue: 'overdue',
  };
  return map[status] ?? status;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SubmissionHistoryTable({
  data,
  page,
  pageSize,
  total,
  onPageChange,
  isLoading,
  toolbar,
}: SubmissionHistoryTableProps) {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname ?? '');

  const columns = React.useMemo(
    () => [
      {
        key: 'domain',
        header: t('submissions.domain'),
        render: (row: Submission) => (
          <span className="text-sm font-medium text-text-primary">
            {getDomainLabel(row.domain)}
          </span>
        ),
      },
      {
        key: 'type',
        header: t('submissions.type'),
        render: (row: Submission) => (
          <span className="text-sm text-text-secondary">
            {row.submission_type}
          </span>
        ),
      },
      {
        key: 'academic_year',
        header: t('submissions.academicYear'),
        render: (row: Submission) => (
          <span className="text-sm text-text-secondary">
            {row.academic_year}
          </span>
        ),
      },
      {
        key: 'status',
        header: t('submissions.status'),
        render: (row: Submission) => (
          <StatusBadge status={statusVariant[row.status] ?? 'neutral'} dot>
            {t(`status.${getStatusKey(row.status)}` as never)}
          </StatusBadge>
        ),
      },
      {
        key: 'submitted_at',
        header: t('submissions.submittedAt'),
        render: (row: Submission) => (
          <span className="text-sm text-text-secondary">
            {formatDateLocale(row.submitted_at, locale)}
          </span>
        ),
      },
      {
        key: 'record_count',
        header: t('submissions.recordCount'),
        render: (row: Submission) => (
          <span className="text-sm tabular-nums text-text-secondary">
            {row.record_count ?? '—'}
          </span>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      toolbar={toolbar}
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      keyExtractor={(row) => row.id}
      isLoading={isLoading}
    />
  );
}
