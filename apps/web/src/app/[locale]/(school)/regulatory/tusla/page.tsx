'use client';

import { BarChart3, Clock, FileText, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TUSLA_DEFAULT_THRESHOLD_DAYS } from '@school/shared/regulatory';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RegulatoryNav } from '../_components/regulatory-nav';

import { ThresholdMonitorTable } from './_components/threshold-monitor-table';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThresholdStudent {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  absent_days: number;
  threshold: number;
  status: 'normal' | 'approaching' | 'exceeded';
}

interface ThresholdMonitorResponse {
  threshold: number;
  data: ThresholdStudent[];
}

// ─── Action Card Data ────────────────────────────────────────────────────────

interface ActionCard {
  titleKey: string;
  descriptionKey: string;
  icon: typeof FileText;
  href: string | null;
}

const ACTION_CARDS: ActionCard[] = [
  {
    titleKey: 'tusla.sarReports',
    descriptionKey: 'tusla.sarDescription',
    icon: FileText,
    href: '/tusla/sar',
  },
  {
    titleKey: 'tusla.aarReports',
    descriptionKey: 'tusla.aarDescription',
    icon: BarChart3,
    href: '/tusla/aar',
  },
  {
    titleKey: 'tusla.reducedDays',
    descriptionKey: 'tusla.reducedDaysDescription',
    icon: Clock,
    href: '/tusla/reduced-days',
  },
  {
    titleKey: 'tusla.absenceMappings',
    descriptionKey: 'tusla.absenceMappingsDescription',
    icon: Settings,
    href: null,
  },
];

// ─── Page Component ──────────────────────────────────────────────────────────

export default function TuslaHubPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [thresholdData, setThresholdData] = React.useState<ThresholdStudent[]>([]);
  const [threshold, setThreshold] = React.useState(TUSLA_DEFAULT_THRESHOLD_DAYS);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchThresholdData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient<ThresholdMonitorResponse>(
        `/api/v1/regulatory/tusla/threshold-monitor?threshold_days=${TUSLA_DEFAULT_THRESHOLD_DAYS}`,
        { silent: true },
      );
      setThresholdData(response.data ?? []);
      setThreshold(response.threshold ?? TUSLA_DEFAULT_THRESHOLD_DAYS);
    } catch (err) {
      console.error('[TuslaHubPage.fetchThresholdData]', err);
      setThresholdData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchThresholdData();
  }, [fetchThresholdData]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('tusla.pageTitle')} description={t('tusla.pageDescription')} />

      <RegulatoryNav />

      {/* ─── Action Cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACTION_CARDS.map((card) => {
          const Icon = card.icon;
          const content = (
            <div className="flex h-full flex-col rounded-2xl border border-border bg-surface px-4 py-5 transition-colors hover:bg-surface-secondary sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {t(card.titleKey as never)}
                  </h3>
                  <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                    {t(card.descriptionKey as never)}
                  </p>
                </div>
              </div>
            </div>
          );

          if (card.href) {
            return (
              <Link
                key={card.titleKey}
                href={`/${locale}/regulatory${card.href}`}
                className="min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-2xl"
              >
                {content}
              </Link>
            );
          }

          return (
            <div key={card.titleKey} className="cursor-default opacity-80">
              {content}
            </div>
          );
        })}
      </div>

      {/* ─── Threshold Monitor ─────────────────────────────────────────────── */}
      <ThresholdMonitorTable data={thresholdData} threshold={threshold} isLoading={isLoading} />
    </div>
  );
}
