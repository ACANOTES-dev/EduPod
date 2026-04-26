/**
 * Trip → Fee generation page.
 *
 * Walks the user through the dry-run preview → confirmation modal →
 * cross-module transactional commit (`POST /generate-fees`). Per the
 * impl-18 spec, production smoke testing must NOT actually confirm
 * (no live invoices for testing). The page is wired end-to-end but
 * tests stop at "modal opens, click Cancel".
 */

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { EventBudgetStatus } from '@school/shared/budgeting';
import { Button, Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../../../_components/currency-display';
import { useTenantCurrency } from '../../../../_components/use-tenant-currency';
import type { EventBudgetSummary } from '../_components/event-types';

import { GenerateFeesConfirmModal } from './_components/generate-fees-confirm-modal';
import { GenerateFeesErrorState } from './_components/generate-fees-error-state';
import { GenerateFeesSuccessState } from './_components/generate-fees-success-state';
import {
  isKnownErrorCode,
  RECOVERABLE_ERROR_CODES,
  type CommitResult,
  type KnownErrorCode,
  type PreviewResult,
} from './_components/generate-fees-types';

interface Props {
  params: { locale: string; id: string };
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'preview'; data: PreviewResult; eventName: string }
  | { kind: 'confirming'; data: PreviewResult; eventName: string }
  | { kind: 'success'; runId: string; invoiceCount: number; totalAmount: number }
  | { kind: 'error'; code: string; message: string; recoverable: boolean };

interface ApiError {
  error?: { code?: string; message?: string };
  status?: number;
}

export default function GenerateFeesPage({ params }: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees');
  const router = useRouter();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const eventId = params.id;

  const [view, setView] = React.useState<ViewState>({ kind: 'loading' });
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // ─── Load preview ──────────────────────────────────────────────────────

  const loadPreview = React.useCallback(async (): Promise<void> => {
    setView({ kind: 'loading' });
    try {
      // Step 1: confirm event status.
      const event = await apiClient<EventBudgetSummary>(
        `/api/v1/budgeting/event-budgets/${eventId}`,
      );
      const status: EventBudgetStatus = event.status;
      if (status !== 'confirmed') {
        const code: KnownErrorCode =
          status === 'fees_generated'
            ? 'FEES_ALREADY_GENERATED'
            : status === 'cancelled'
              ? 'EVENT_CANCELLED'
              : 'EVENT_NOT_CONFIRMED';
        setView({
          kind: 'error',
          code,
          message: '',
          recoverable: RECOVERABLE_ERROR_CODES.includes(code),
        });
        return;
      }

      // Step 2: load preview.
      const preview = await apiClient<PreviewResult>(
        `/api/v1/budgeting/event-budgets/${eventId}/generate-fees/preview`,
        { silent: true },
      );
      setView({ kind: 'preview', data: preview, eventName: event.name });
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr?.error?.code ?? 'UNKNOWN_ERROR';
      const message = apiErr?.error?.message ?? t('loadError');
      console.error('[GenerateFees.loadPreview]', err);
      setView({
        kind: 'error',
        code,
        message,
        recoverable: isKnownErrorCode(code) && RECOVERABLE_ERROR_CODES.includes(code),
      });
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  // ─── Confirm handler ──────────────────────────────────────────────────

  const handleConfirm = React.useCallback(async (): Promise<void> => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiClient<CommitResult>(
        `/api/v1/budgeting/event-budgets/${eventId}/generate-fees`,
        {
          method: 'POST',
          body: JSON.stringify({ confirm: true }),
          silent: true,
        },
      );
      setView({
        kind: 'success',
        runId: res.fee_generation_run_id,
        invoiceCount: res.student_count,
        totalAmount: res.total_invoiced,
      });
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr?.error?.code ?? 'UNKNOWN_ERROR';
      const message = apiErr?.error?.message ?? t('errors.UNKNOWN_ERROR.body');
      console.error('[GenerateFees.confirm]', err);
      setSubmitError(message);
      // Some error codes mean the page should reload back to a fresh
      // state instead of staying on the modal — namely the "preview is
      // no longer valid" set.
      if (
        code === 'FEES_ALREADY_GENERATED' ||
        code === 'EVENT_CANCELLED' ||
        code === 'EVENT_NOT_CONFIRMED'
      ) {
        setView({
          kind: 'error',
          code,
          message,
          recoverable: false,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [eventId, t]);

  // ─── Render ────────────────────────────────────────────────────────────

  if (view.kind === 'loading') {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (view.kind === 'error') {
    return (
      <div className="flex flex-col gap-4 p-6 pb-10">
        <PageHeader
          title={t('title')}
          back={{
            href: `/${locale}/finance/budgeting/events/${eventId}`,
            label: t('back'),
          }}
        />
        <GenerateFeesErrorState
          code={view.code}
          message={view.message}
          recoverable={view.recoverable}
          eventId={eventId}
          locale={locale}
          onRetry={() => void loadPreview()}
        />
      </div>
    );
  }

  if (view.kind === 'success') {
    return (
      <div className="flex flex-col gap-4 p-6 pb-10">
        <PageHeader
          title={t('title')}
          back={{
            href: `/${locale}/finance/budgeting/events/${eventId}`,
            label: t('back'),
          }}
        />
        <GenerateFeesSuccessState
          runId={view.runId}
          invoiceCount={view.invoiceCount}
          totalAmount={view.totalAmount}
          currencyCode={currencyCode}
          locale={locale}
          eventId={eventId}
        />
      </div>
    );
  }

  const preview = view.data;
  const eventName = view.eventName;
  // Nothing to invoice when there are no participating students. This happens
  // when the event has no class/year-group scope set on the event header — the
  // backend resolves zero students and the preview comes back with student_count
  // = 0. The CTA is disabled with a hint so the user knows to go back and set
  // a scope before retrying.
  const hasStudentsToInvoice = preview.totals.student_count > 0;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={eventName}
        back={{
          href: `/${locale}/finance/budgeting/events/${eventId}`,
          label: t('back'),
        }}
      />

      {/* Summary KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t('summary.totalToInvoice')}
          value={preview.totals.total_to_invoice}
          currencyCode={currencyCode}
          locale={locale}
          accent="emerald"
        />
        <Stat
          label={t('summary.schoolSubsidy')}
          value={preview.totals.total_school_subsidy}
          currencyCode={currencyCode}
          locale={locale}
          accent="violet"
        />
        <CountStat label={t('summary.households')} value={preview.totals.household_count} />
        <CountStat label={t('summary.students')} value={preview.totals.student_count} />
      </section>

      {/* Payment plan */}
      <PaymentPlanCard preview={preview} locale={locale} />

      {!hasStudentsToInvoice && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{t('noStudents.title')}</p>
          <p className="mt-1">{t('noStudents.body')}</p>
        </section>
      )}

      {/* Households table */}
      <HouseholdsBlock preview={preview} currencyCode={currencyCode} locale={locale} />

      <footer className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push(`/${locale}/finance/budgeting/events/${eventId}`)}
        >
          {t('actions.backToEvent')}
        </Button>
        <Button
          onClick={() => setView({ kind: 'confirming', data: preview, eventName })}
          disabled={!hasStudentsToInvoice}
          title={!hasStudentsToInvoice ? t('noStudents.title') : undefined}
        >
          {t('actions.generateFees')}
        </Button>
      </footer>

      <GenerateFeesConfirmModal
        open={view.kind === 'confirming'}
        onClose={() => {
          setSubmitError(null);
          setView({ kind: 'preview', data: preview, eventName });
        }}
        preview={preview}
        eventName={eventName}
        currencyCode={currencyCode}
        locale={locale}
        isSubmitting={submitting}
        errorMessage={submitError}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  currencyCode,
  locale,
  accent,
}: {
  label: string;
  value: number;
  currencyCode: string;
  locale: string;
  accent: 'emerald' | 'violet';
}) {
  const accentClass = accent === 'emerald' ? 'text-emerald-700' : 'text-violet-700';
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p dir="ltr" className={`mt-1 font-mono text-xl font-semibold tabular-nums ${accentClass}`}>
        <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />
      </p>
    </div>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      <p dir="ltr" className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}

function PaymentPlanCard({ preview, locale }: { preview: PreviewResult; locale: string }) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees.paymentPlan');
  const dates = preview.households[0]?.payment_plan_dates ?? null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-xs uppercase tracking-wide text-text-tertiary">{t('header')}</h2>
      <p className="mt-1 text-sm text-text-primary">
        {preview.payment_plan === 'one_off'
          ? t('oneOff')
          : t('split', { count: preview.payment_plan.replace('_payments', '') })}
      </p>
      {dates && dates.length > 0 ? (
        <p className="mt-1 text-xs text-text-tertiary">
          {dates.map((d) => new Date(d).toLocaleDateString(locale)).join(' · ')}
        </p>
      ) : (
        <p className="mt-1 text-xs text-text-tertiary">{t('noDates')}</p>
      )}
    </section>
  );
}

function HouseholdsBlock({
  preview,
  currencyCode,
  locale,
}: {
  preview: PreviewResult;
  currencyCode: string;
  locale: string;
}) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees.households');

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">{t('header')}</h2>
      </header>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-xs text-text-tertiary">
            <tr>
              <th scope="col" className="px-4 py-2 text-start">
                {t('cols.household')}
              </th>
              <th scope="col" className="px-4 py-2 text-start">
                {t('cols.students')}
              </th>
              <th scope="col" className="px-4 py-2 text-end">
                {t('cols.amount')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.households.map((h) => (
              <tr key={h.household_id}>
                <th scope="row" className="px-4 py-2 text-start text-text-primary">
                  {h.household_name}
                </th>
                <td className="px-4 py-2 text-text-secondary">
                  {h.students.map((s) => s.student_name).join(', ')}
                </td>
                <td
                  dir="ltr"
                  className="px-4 py-2 text-end font-mono tabular-nums text-text-primary"
                >
                  <CurrencyDisplay
                    amount={h.total_amount}
                    currency_code={currencyCode}
                    locale={locale}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col divide-y divide-border sm:hidden">
        {preview.households.map((h) => (
          <li key={h.household_id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-text-primary">{h.household_name}</span>
              <span dir="ltr" className="font-mono tabular-nums">
                <CurrencyDisplay
                  amount={h.total_amount}
                  currency_code={currencyCode}
                  locale={locale}
                />
              </span>
            </div>
            <span className="text-xs text-text-tertiary">
              {h.students.map((s) => s.student_name).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
