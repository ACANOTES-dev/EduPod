'use client';

import { CheckCircle2, Lock, MailPlus, Plus, RotateCcw, Timer, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveWindow {
  id: string;
  academic_period_id: string;
  opens_at: string;
  closes_at: string;
  status: 'scheduled' | 'open' | 'closed';
  instructions: string | null;
}

interface WindowBannerProps {
  window: ActiveWindow | null;
  periodName: string | null;
  isAdmin: boolean;
  locale: string;
  onOpenWindow?: () => void;
  onCloseWindow?: () => void;
  onExtendWindow?: () => void;
  onReopenWindow?: () => void;
  onRequestReopen?: () => void;
  closingInFlight?: boolean;
  openingInFlight?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WindowBanner({
  window,
  periodName,
  isAdmin,
  locale,
  onOpenWindow,
  onCloseWindow,
  onExtendWindow,
  onReopenWindow,
  onRequestReopen,
  closingInFlight,
  openingInFlight,
}: WindowBannerProps) {
  const t = useTranslations('reportComments.windowBanner');
  const isOpen = window?.status === 'open';

  if (isOpen && window) {
    return (
      <section
        className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"
        aria-live="polite"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-900">{t('openTitle')}</p>
              <p className="text-sm text-emerald-900/80">
                {periodName
                  ? t('openBody', {
                      period: periodName,
                      closesAt: formatDate(window.closes_at, locale),
                    })
                  : t('openBodyNoPeriod')}
              </p>
              {window.instructions && (
                <p className="text-xs text-emerald-900/70">
                  <span className="font-medium">{t('instructionsLabel')}:</span>{' '}
                  {window.instructions}
                </p>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {onExtendWindow && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onExtendWindow}
                  className="min-h-11"
                >
                  <Timer className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {t('extend')}
                </Button>
              )}
              {onCloseWindow && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCloseWindow}
                  disabled={closingInFlight}
                  className="min-h-11"
                >
                  <X className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {closingInFlight ? t('closing') : t('closeNow')}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Closed or no window at all
  return (
    <section
      className="rounded-2xl border border-border bg-surface-secondary p-4 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text-tertiary/10 text-text-tertiary">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text-primary">{t('closedTitle')}</p>
            <p className="text-sm text-text-secondary">
              {window ? t('closedBody') : t('closedBodyNoHistory')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAdmin && onOpenWindow && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onOpenWindow}
              disabled={openingInFlight}
              className="min-h-11"
            >
              <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
              {openingInFlight ? t('opening') : t('openWindow')}
            </Button>
          )}
          {isAdmin && window && onReopenWindow && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReopenWindow}
              className="min-h-11"
            >
              <RotateCcw className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('reopen')}
            </Button>
          )}
          {!isAdmin && onRequestReopen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRequestReopen}
              className="min-h-11"
            >
              <MailPlus className="me-1.5 h-4 w-4" aria-hidden="true" />
              {t('requestReopen')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
