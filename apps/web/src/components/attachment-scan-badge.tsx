'use client';

import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

// WB-C-09 — Surfaces the scan status attached to every file uploaded into
// behaviour / safeguarding / inbox. Backend values: see `ScanStatus` enum in
// `packages/prisma/schema.prisma`.

export type ScanStatus = 'pending_scan' | 'pending' | 'clean' | 'infected' | 'scan_failed';

interface Props {
  status: ScanStatus | string;
  size?: 'sm' | 'md';
}

export function AttachmentScanBadge({ status, size = 'sm' }: Props) {
  const t = useTranslations('attachments.scanStatus');

  // Normalise the raw prisma enum value (`pending_scan` maps to `pending` via
  // `@map("pending")` on the enum declaration).
  const key = status === 'pending' ? 'pending_scan' : (status as ScanStatus);

  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3 w-3';

  switch (key) {
    case 'clean':
      return (
        <Badge variant="default" className="gap-1 bg-success-50 text-success-700">
          <CheckCircle2 className={iconClass} aria-hidden="true" />
          {t('clean')}
        </Badge>
      );
    case 'infected':
      return (
        <Badge variant="danger" className="gap-1">
          <ShieldAlert className={iconClass} aria-hidden="true" />
          {t('flagged')}
        </Badge>
      );
    case 'scan_failed':
      return (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className={iconClass} aria-hidden="true" />
          {t('failed')}
        </Badge>
      );
    case 'pending_scan':
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className={iconClass} aria-hidden="true" />
          {t('pending')}
        </Badge>
      );
  }
}

/**
 * Flagged banner shown on the attachment card when the scan failed or
 * found a threat. Surfaces the reason (when available) and a support CTA.
 */
export function AttachmentFlaggedBanner({ reason }: { reason?: string | null }) {
  const t = useTranslations('attachments');
  return (
    <div className="mt-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
      <p className="font-medium">{t('flaggedBanner.title')}</p>
      <p className="mt-0.5">{reason ?? t('flaggedBanner.genericReason')}</p>
      <p className="mt-1 text-[11px] text-danger-700/80">{t('flaggedBanner.contactDlp')}</p>
    </div>
  );
}
