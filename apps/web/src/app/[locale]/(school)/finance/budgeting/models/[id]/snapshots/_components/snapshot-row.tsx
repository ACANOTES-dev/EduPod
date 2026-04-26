'use client';

import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCw,
  Share2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Badge, Button } from '@school/ui';

import { deriveRenderStatus, type SnapshotSummary } from './snapshot-types';

interface Props {
  snapshot: SnapshotSummary;
  isCurrent: boolean;
  modelId: string;
  locale: string;
  canPublish: boolean;
  /** When true, the Share button routes to the model-level shareable-links page (impl 19). */
  canShare: boolean;
  onView: () => void;
  onRestoreClick: () => void;
  onRetryRender: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

function formatPublishedAt(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function SnapshotRow({
  snapshot,
  isCurrent,
  modelId,
  locale,
  canPublish,
  canShare,
  onView,
  onRestoreClick,
  onRetryRender,
}: Props) {
  const t = useTranslations('financeBudgetingSnapshots.row');

  const pdfStatus = deriveRenderStatus(snapshot.pdf_object_key, snapshot.published_at);
  const excelStatus = deriveRenderStatus(snapshot.excel_object_key, snapshot.published_at);

  const pdfDownload = `${API_URL}/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshot.id}/exports/pdf`;
  const excelDownload = `${API_URL}/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshot.id}/exports/excel`;

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView();
        }
      }}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t('versionPill', { n: snapshot.version_number })}</Badge>
          {isCurrent && <Badge variant="success">{t('currentPill')}</Badge>}
          <span className="text-xs text-text-tertiary">
            {t('publishedAt', { date: formatPublishedAt(snapshot.published_at, locale) })}
          </span>
        </div>
      </div>

      {snapshot.executive_summary && (
        <p className="line-clamp-2 text-sm text-text-secondary">{snapshot.executive_summary}</p>
      )}

      <div
        className="flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <RenderStatusButton
          status={pdfStatus}
          label={t('downloadPdf')}
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          href={pdfDownload}
          onRetry={onRetryRender}
        />
        <RenderStatusButton
          status={excelStatus}
          label={t('downloadExcel')}
          icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
          href={excelDownload}
          onRetry={onRetryRender}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRestoreClick}
          disabled={!canPublish}
          title={!canPublish ? t('restoreDisabled') : undefined}
        >
          {t('restore')}
        </Button>
        {canShare && (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/${locale}/finance/budgeting/models/${modelId}/share`}>
              <Share2 className="me-1 h-4 w-4" aria-hidden="true" />
              {t('share')}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function RenderStatusButton({
  status,
  label,
  icon,
  href,
  onRetry,
}: {
  status: 'pending' | 'ready' | 'failed';
  label: string;
  icon: React.ReactNode;
  href: string;
  onRetry: () => void;
}) {
  const t = useTranslations('financeBudgetingSnapshots.row.renderStatus');
  if (status === 'ready') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        {icon}
        {label}
      </a>
    );
  }
  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        {label}
        <span className="ms-1">{t('retry')}</span>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-secondary px-3 py-1.5 text-xs font-semibold text-text-tertiary"
      aria-busy="true"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {icon}
      {label}
    </span>
  );
}
