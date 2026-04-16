'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useSolverProgress } from '@/providers/solver-progress-provider';

// Non-obstructive bottom-end widget shown while a scheduling-solver run is
// active. Persists across page navigation (the provider lives in the school
// layout). Only dismisses on explicit user action — closing the widget does
// NOT cancel the run; there is a dedicated Cancel button for that.

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SolverProgressWidget() {
  const { snapshot, dismiss, cancel, isTerminal } = useSolverProgress();
  // Strings live under scheduling.auto because the widget is specific to
  // auto-scheduler runs — it's mounted globally so a user who navigates
  // away still sees progress, but semantically the copy is auto-scoped.
  const t = useTranslations('scheduling.auto.progressWidget');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = typeof params?.locale === 'string' ? params.locale : 'en';

  // Live-updating elapsed timer so the widget never looks stuck while the
  // next poll is pending. Updates once per second.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!snapshot || isTerminal) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [snapshot, isTerminal]);

  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  if (!snapshot) return null;

  const elapsedMs =
    isTerminal && snapshot.elapsedMs > 0 ? snapshot.elapsedMs : now - snapshot.startedAt;
  const elapsed = formatElapsed(elapsedMs);

  const reviewHref = `/${locale}/scheduling/runs/${snapshot.runId}/review`;

  // ─── Terminal states ──────────────────────────────────────────────────────
  if (snapshot.status === 'completed' || snapshot.status === 'applied') {
    return (
      <WidgetShell
        tone="success"
        title={t('completedTitle')}
        subtitle={t('completedSubtitle', {
          placed: snapshot.placed,
          total: snapshot.total,
          elapsed,
        })}
        icon={<CheckCircle2 className="h-4 w-4" />}
        onDismiss={dismiss}
        dismissLabel={tCommon('close')}
      >
        <Link
          href={reviewHref}
          onClick={dismiss}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          {t('viewReview')}
          <ChevronRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      </WidgetShell>
    );
  }

  if (snapshot.status === 'failed' || snapshot.status === 'discarded') {
    const hasPartial = snapshot.placed > 0;
    return (
      <WidgetShell
        tone="danger"
        title={t('failedTitle')}
        subtitle={
          hasPartial
            ? t('failedSubtitleWithPlacements', {
                placed: snapshot.placed,
                unassigned: snapshot.unassigned,
                elapsed,
              })
            : t('failedSubtitle', { elapsed })
        }
        icon={<AlertTriangle className="h-4 w-4" />}
        onDismiss={dismiss}
        dismissLabel={tCommon('close')}
      >
        {snapshot.failureReason && (
          <p className="mt-1 text-xs leading-snug text-text-secondary line-clamp-3">
            {snapshot.failureReason}
          </p>
        )}
        {hasPartial && (
          <Link
            href={reviewHref}
            onClick={dismiss}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {t('viewResults')}
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
          </Link>
        )}
      </WidgetShell>
    );
  }

  // ─── Running / queued state ───────────────────────────────────────────────
  const phaseLabel = (() => {
    if (snapshot.status === 'queued' || snapshot.phase === 'preparing') {
      return t('phasePreparing');
    }
    return t('phaseSolving');
  })();

  return (
    <WidgetShell
      tone="info"
      title={t('runningTitle')}
      subtitle={t('runningSubtitle', { phase: phaseLabel, elapsed })}
      icon={<Loader2 className="h-4 w-4 animate-spin" />}
      onDismiss={undefined}
    >
      {snapshot.total > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
            <span>{t('slotsAssigned', { placed: snapshot.placed, total: snapshot.total })}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{
                width: `${Math.min(100, Math.round((snapshot.placed / snapshot.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {confirmingCancel ? (
        <div className="mt-2 rounded-lg border border-border bg-surface-secondary p-2 text-xs">
          <p className="text-text-primary">{t('cancelConfirm')}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmingCancel(false);
                void cancel();
              }}
              className="flex-1 rounded-lg bg-red-500 px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              {t('cancelYes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface"
            >
              {t('cancelNo')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          className="mt-2 w-full rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          {t('cancelButton')}
        </button>
      )}
    </WidgetShell>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function WidgetShell({
  tone,
  title,
  subtitle,
  icon,
  onDismiss,
  dismissLabel,
  children,
}: {
  tone: 'info' | 'success' | 'danger';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onDismiss: (() => void) | undefined;
  dismissLabel?: string;
  children: React.ReactNode;
}) {
  const toneStyles = {
    info: 'text-brand',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-500',
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 end-4 z-40 w-[20rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 ${toneStyles}`}>
          {icon ?? <Sparkles className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{title}</p>
          <p className="mt-0.5 text-xs text-text-secondary leading-snug">{subtitle}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel ?? 'Dismiss'}
            className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
