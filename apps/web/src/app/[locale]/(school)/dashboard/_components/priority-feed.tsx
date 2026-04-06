'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import type { PriorityData } from './admin-home';

// ─── Types ──────────────────────────────────────────────────────────────────

type PriorityCard = {
  id: number | string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

type PriorityFeedProps =
  | { priorityData: PriorityData; customItems?: never }
  | { customItems: PriorityCard[]; priorityData?: never };

// ─── Card builder helpers ───────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildCards(
  data: PriorityData,
  t: ReturnType<typeof useTranslations<'dashboard'>>,
): PriorityCard[] {
  const cards: PriorityCard[] = [];

  if (data.outstanding_amount && data.outstanding_amount > 0) {
    const formattedAmount = formatCurrency(data.outstanding_amount);
    cards.push({
      id: 'finance-outstanding',
      icon: CircleDollarSign,
      iconBg: 'bg-amber-100 dark:bg-amber-500/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      title: t('outstandingBalance'),
      description: t('unpaidAcrossInvoices', { amount: formattedAmount }),
      actionLabel: t('reviewInvoices'),
      href: '/finance/invoices',
    });
  }

  if (data.unresolved_incidents && data.unresolved_incidents > 0) {
    const count = data.unresolved_incidents;
    cards.push({
      id: 'behaviour-incidents',
      icon: AlertTriangle,
      iconBg: 'bg-red-100 dark:bg-red-500/20',
      iconColor: 'text-red-600 dark:text-red-400',
      title:
        count === 1 ? t('openIncidentSingular', { count }) : t('openIncidentPlural', { count }),
      description: t('followUpsAndAlerts'),
      actionLabel: t('viewIncidents'),
      href: '/behaviour/incidents',
    });
  }

  if (data.pending_approvals && data.pending_approvals > 0) {
    const count = data.pending_approvals;
    cards.push({
      id: 'pending-approvals',
      icon: ClipboardCheck,
      iconBg: 'bg-blue-100 dark:bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      title:
        count === 1
          ? t('pendingApprovalSingular', { count })
          : t('pendingApprovalPlural', { count }),
      description: t('requestsWaiting'),
      actionLabel: t('review'),
      href: '/approvals',
    });
  }

  if (data.pending_admissions && data.pending_admissions > 0) {
    const count = data.pending_admissions;
    cards.push({
      id: 'pending-admissions',
      icon: GraduationCap,
      iconBg: 'bg-violet-100 dark:bg-violet-500/20',
      iconColor: 'text-violet-600 dark:text-violet-400',
      title:
        count === 1
          ? t('pendingApplicationSingular', { count })
          : t('pendingApplicationPlural', { count }),
      description: t('admissionsUnderReview'),
      actionLabel: t('viewApplications'),
      href: '/admissions',
    });
  }

  // Show a maximum of 3 cards
  return cards.slice(0, 3);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PriorityFeed(props: PriorityFeedProps) {
  const t = useTranslations('dashboard');

  const cards = React.useMemo(() => {
    if (props.customItems) return props.customItems;
    return buildCards(props.priorityData ?? {}, t);
  }, [props.customItems, props.priorityData, t]);

  const hasItems = cards.length > 0;

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <h3 className="text-[16px] font-semibold text-text-primary">{t('needsYourAttention')}</h3>

      {hasItems ? (
        <div
          className={`grid grid-cols-1 gap-4 ${
            cards.length === 1
              ? 'md:grid-cols-1 max-w-sm'
              : cards.length === 2
                ? 'md:grid-cols-2'
                : 'md:grid-cols-3'
          }`}
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="flex flex-col rounded-xl border border-border bg-surface p-4 gap-3"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${card.iconBg}`}
                >
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-text-primary">{card.title}</p>
                  <p className="text-[12px] text-text-tertiary mt-0.5">{card.description}</p>
                </div>
                <Link
                  href={card.href}
                  className="block w-full rounded-lg bg-primary-700 px-4 py-2.5 text-center text-[13px] font-semibold text-btn-primary-text hover:bg-primary-800 transition-colors"
                >
                  {card.actionLabel}
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-emerald-100 dark:bg-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text-primary">{t('allClear')}</p>
            <p className="text-[12px] text-text-tertiary mt-0.5">{t('nothingNeedsAttention')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
