'use client';

import { CheckCircle2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'low' | 'medium' | 'high';

interface OversightFlagSummary {
  id: string;
  conversation_id: string;
  message_id: string;
  matched_keywords: string[];
  highest_severity: Severity;
  review_state: 'pending' | 'dismissed' | 'escalated' | 'frozen';
  created_at: string;
  participants: { user_id: string; display_name: string }[];
  review_url: string;
}

interface FlagsResponse {
  data: OversightFlagSummary[];
  meta: { page: number; pageSize: number; total: number };
}

const ADMIN_TIER_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'];
const POLL_INTERVAL_MS = 60_000;
const SEVERITY_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

// ─── Severity pill ────────────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: Severity }) {
  const t = useTranslations('safeguarding.alerts.severity');
  const classes: Record<Severity, string> = {
    low: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    medium: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
    high: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${classes[severity]}`}
    >
      {t(severity)}
    </span>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function SafeguardingAlertsWidget() {
  const t = useTranslations('safeguarding.alerts');
  const { user } = useAuth();

  const isAdminTier = React.useMemo(() => {
    const roles = user?.memberships?.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []) ?? [];
    return roles.some((r) => ADMIN_TIER_ROLE_KEYS.includes(r));
  }, [user]);

  const [flags, setFlags] = React.useState<OversightFlagSummary[]>([]);
  const [totalPending, setTotalPending] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  const fetchFlags = React.useCallback(async () => {
    try {
      const res = await apiClient<FlagsResponse>(
        '/api/v1/inbox/oversight/flags?page=1&pageSize=3&review_state=pending',
        { silent: true },
      );
      const rows = res.data ?? [];
      const sorted = [...rows].sort((a, b) => {
        const byWeight = SEVERITY_WEIGHT[b.highest_severity] - SEVERITY_WEIGHT[a.highest_severity];
        if (byWeight !== 0) return byWeight;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setFlags(sorted);
      setTotalPending(res.meta?.total ?? sorted.length);
      setHasError(false);
    } catch (err) {
      console.error('[SafeguardingAlertsWidget.fetch]', err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isAdminTier) {
      setIsLoading(false);
      return;
    }
    void fetchFlags();
    const timer = window.setInterval(() => {
      void fetchFlags();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [fetchFlags, isAdminTier]);

  if (!isAdminTier) return null;

  // ─── Loading shell ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-secondary" />
        <div className="mt-3 h-10 animate-pulse rounded bg-surface-secondary" />
      </div>
    );
  }

  // ─── All-clear collapsed state ──────────────────────────────────────────────
  if (!hasError && totalPending === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
          <p className="text-xs text-text-secondary">{t('all_clear')}</p>
        </div>
      </div>
    );
  }

  // ─── Expanded state ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-surface p-4 dark:border-amber-500/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        </div>
        {totalPending > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            {t('pending_count', { count: totalPending })}
          </span>
        )}
      </div>

      {hasError ? (
        <p className="mt-3 text-xs text-text-secondary">{t('error')}</p>
      ) : flags.length === 0 ? (
        <p className="mt-3 text-xs text-text-secondary">{t('all_clear')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {flags.map((flag) => {
            const participantLabel = flag.participants
              .slice(0, 2)
              .map((p) => p.display_name)
              .join(', ');
            return (
              <li key={flag.id}>
                <Link
                  href={flag.review_url}
                  className="block rounded-md border border-border bg-surface-secondary p-2 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-500/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <SeverityPill severity={flag.highest_severity} />
                    <span className="text-[11px] text-text-tertiary">
                      {new Date(flag.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {flag.matched_keywords.slice(0, 4).map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center rounded bg-surface px-1.5 py-0.5 text-[11px] font-mono text-text-secondary"
                      >
                        {kw}
                      </span>
                    ))}
                    {flag.matched_keywords.length > 4 && (
                      <span className="text-[11px] text-text-tertiary">
                        +{flag.matched_keywords.length - 4}
                      </span>
                    )}
                  </div>
                  {participantLabel && (
                    <p className="mt-1 truncate text-[11px] text-text-secondary">
                      {participantLabel}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/inbox/oversight?filter=flags"
        className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-secondary"
      >
        {t('view_all')}
      </Link>
    </div>
  );
}
