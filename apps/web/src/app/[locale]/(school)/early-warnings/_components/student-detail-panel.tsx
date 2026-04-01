'use client';

import { ClipboardCheck, ExternalLink, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@school/ui';

import { DomainScoreBars } from './domain-score-bars';
import { RiskTierBadge } from './risk-tier-badge';
import { SignalBreakdown } from './signal-breakdown';
import { TierTransitionTimeline } from './tier-transition-timeline';
import { TrendSparkline } from './trend-sparkline';

import { apiClient } from '@/lib/api-client';
import type { RiskProfileDetail } from '@/lib/early-warning';

interface StudentDetailPanelProps {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledged?: () => void;
}

export function StudentDetailPanel({
  studentId,
  open,
  onOpenChange,
  onAcknowledged,
}: StudentDetailPanelProps) {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [detail, setDetail] = React.useState<RiskProfileDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acknowledging, setAcknowledging] = React.useState(false);

  React.useEffect(() => {
    if (!studentId || !open) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiClient<{ data: RiskProfileDetail }>(`/api/v1/early-warnings/${studentId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((err) => {
        console.error('[StudentDetailPanel]', err);
        toast.error(t('errors.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, open, t]);

  const handleAcknowledge = async () => {
    if (!studentId) return;
    setAcknowledging(true);
    try {
      await apiClient(`/api/v1/early-warnings/${studentId}/acknowledge`, {
        method: 'POST',
      });
      toast.success(t('detail.acknowledged'));
      onAcknowledged?.();
    } catch (err) {
      console.error('[StudentDetailPanel.acknowledge]', err);
      toast.error(t('errors.action_failed'));
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !detail ? (
          <div className="space-y-4 pt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{detail.student_name}</SheetTitle>
              <SheetDescription>
                <span className="flex items-center gap-2">
                  <RiskTierBadge tier={detail.risk_tier} />
                  <span className="font-mono text-sm">
                    {t('list.score')}: {detail.composite_score.toFixed(0)}
                  </span>
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* NL Summary */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">{t('detail.summary')}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {detail.summary_text}
                </p>
              </section>

              {/* Domain Breakdown */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">{t('detail.domains')}</h3>
                <div className="mt-3">
                  <DomainScoreBars
                    scores={{
                      attendance: detail.attendance_score,
                      grades: detail.grades_score,
                      behaviour: detail.behaviour_score,
                      wellbeing: detail.wellbeing_score,
                      engagement: detail.engagement_score,
                    }}
                  />
                </div>
              </section>

              {/* 30-Day Trend */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">{t('detail.trend')}</h3>
                <div className="mt-3 rounded-xl border border-border p-4">
                  <TrendSparkline data={detail.trend_data} width={320} height={48} />
                </div>
              </section>

              {/* Signal Breakdown */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">{t('detail.signals')}</h3>
                <div className="mt-3">
                  <SignalBreakdown signals={detail.signals} />
                </div>
              </section>

              {/* Tier Transition History */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.transitions')}
                </h3>
                <div className="mt-3">
                  <TierTransitionTimeline transitions={detail.transitions} />
                </div>
              </section>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                >
                  <ClipboardCheck className="me-2 h-4 w-4" />
                  {t('detail.acknowledge')}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${locale}/early-warnings?assign=${detail.student_id}`}>
                    <UserPlus className="me-2 h-4 w-4" />
                    {t('detail.assign')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/${locale}/pastoral/interventions/new?student_id=${detail.student_id}`}
                  >
                    <ExternalLink className="me-2 h-4 w-4" />
                    {t('detail.create_intervention')}
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
