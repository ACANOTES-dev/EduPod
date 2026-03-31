'use client';

import { CheckCircle2, CreditCard, Users } from 'lucide-react';
import * as React from 'react';

interface MetricCardProps {
  title: string;
  description: string;
  current: number;
  total: number;
  accentClassName: string;
  icon: React.ElementType;
}

function MetricCard({
  title,
  description,
  current,
  total,
  accentClassName,
  icon: Icon,
}: MetricCardProps) {
  const safeTotal = Math.max(total, 1);
  const progress = Math.min(100, Math.round((current / safeTotal) * 100));

  return (
    <article className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">{title}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">
            {progress}%
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{description}</p>
        </div>
        <div className={`rounded-2xl p-3 ${accentClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
          <div
            className={`h-full rounded-full transition-all ${accentClassName}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
          <span>{current} complete</span>
          <span>{total} total</span>
        </div>
      </div>
    </article>
  );
}

interface CompletionDashboardProps {
  consentGranted: number;
  consentTotal: number;
  paymentPaid: number;
  paymentTotal: number;
  registered: number;
  invited: number;
  capacity?: number | null;
  capacityUsed?: number;
}

export function CompletionDashboard({
  consentGranted,
  consentTotal,
  paymentPaid,
  paymentTotal,
  registered,
  invited,
  capacity,
  capacityUsed,
}: CompletionDashboardProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <MetricCard
        title="Consent"
        description="Families that have completed the required consent step."
        current={consentGranted}
        total={consentTotal}
        accentClassName="bg-emerald-100 text-emerald-700"
        icon={CheckCircle2}
      />
      <MetricCard
        title="Payment"
        description="Participants who have completed payment or been waived."
        current={paymentPaid}
        total={paymentTotal}
        accentClassName="bg-sky-100 text-sky-700"
        icon={CreditCard}
      />
      <MetricCard
        title="Registration"
        description={
          capacity
            ? `Registration progress against ${capacity} available places.`
            : 'Confirmed registrations compared with invited participants.'
        }
        current={capacity ? (capacityUsed ?? registered) : registered}
        total={capacity ?? invited}
        accentClassName="bg-amber-100 text-amber-700"
        icon={Users}
      />
    </section>
  );
}
