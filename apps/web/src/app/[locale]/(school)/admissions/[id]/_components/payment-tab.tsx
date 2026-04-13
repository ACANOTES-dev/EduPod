'use client';

import { CurrencyDisplay } from '../../../finance/_components/currency-display';
import { useTenantCurrency } from '../../../finance/_components/use-tenant-currency';

import type { ApplicationDetail } from './types';

export function PaymentTab({ application }: { application: ApplicationDetail }) {
  const override = application.override_record;
  const deadline = application.payment_deadline ? new Date(application.payment_deadline) : null;
  const now = Date.now();
  const deadlineExpired = deadline ? deadline.getTime() < now : false;
  const currencyCode = useTenantCurrency();

  // ADM-030: Stripe checkout sessions expire after at most 23 hours from
  // creation. If the application's `payment_deadline` is further out than
  // that, the Stripe link will lapse before the deadline and the parent
  // would need a fresh regenerate. Warn the admin so they know to re-issue.
  const stripeMaxExpiryMs = 23 * 60 * 60 * 1000;
  const stripeExpiresEarlier =
    deadline !== null &&
    application.stripe_checkout_session_id !== null &&
    deadline.getTime() > now + stripeMaxExpiryMs;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-text-primary">Expected payment</h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-text-tertiary">Amount</dt>
            <dd className="font-mono text-sm text-text-primary">
              {application.payment_amount_cents !== null ? (
                <CurrencyDisplay
                  amount={application.payment_amount_cents / 100}
                  currency_code={currencyCode}
                />
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">Deadline</dt>
            <dd className="text-sm text-text-primary">
              {deadline ? deadline.toLocaleString() : '—'}
              {deadlineExpired && application.status === 'conditional_approval' && (
                <span className="ms-2 text-xs text-danger-text">(expired)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">Stripe checkout session</dt>
            <dd className="break-all font-mono text-xs text-text-secondary">
              {application.stripe_checkout_session_id ?? '—'}
            </dd>
            {stripeExpiresEarlier && (
              <p className="mt-1 text-xs text-amber-700">
                Stripe sessions expire after 23h — this link will lapse before the payment deadline.
                Use &ldquo;Copy payment link&rdquo; to issue a fresh session closer to the deadline.
              </p>
            )}
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">Current status</dt>
            <dd className="text-sm capitalize text-text-primary">
              {application.status.replace(/_/g, ' ')}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-text-primary">Stripe payment events</h3>
        {application.payment_events.length === 0 ? (
          <p className="mt-2 text-sm text-text-tertiary">
            No Stripe payment events recorded. Cash, bank transfer, and override approvals are
            recorded in the Timeline tab.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {application.payment_events.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between rounded-lg bg-surface-secondary px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-mono text-text-primary">{event.stripe_event_id}</p>
                  <p className="mt-0.5 text-text-tertiary">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="ms-3 shrink-0 text-end">
                  <p className="font-mono text-text-primary">
                    <CurrencyDisplay
                      amount={event.amount_cents / 100}
                      currency_code={currencyCode}
                    />
                  </p>
                  <p className="text-text-tertiary">{event.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {override && (
        <div className="rounded-xl border border-danger-border bg-surface p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-danger-text">Admin override</h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-tertiary">Type</dt>
              <dd className="text-sm text-text-primary">
                {override.override_type.replace(/_/g, ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Approved by</dt>
              <dd className="text-sm text-text-primary">
                {override.approved_by.first_name} {override.approved_by.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Expected</dt>
              <dd className="font-mono text-sm text-text-primary">
                <CurrencyDisplay
                  amount={override.expected_amount_cents / 100}
                  currency_code={currencyCode}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Collected</dt>
              <dd className="font-mono text-sm text-text-primary">
                <CurrencyDisplay
                  amount={override.actual_amount_cents / 100}
                  currency_code={currencyCode}
                />
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-text-tertiary">Justification</dt>
              <dd className="whitespace-pre-wrap text-sm text-text-primary">
                {override.justification}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-text-tertiary">Approved at</dt>
              <dd className="text-sm text-text-primary">
                {new Date(override.created_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
