'use client';

import * as React from 'react';

import { apiClient } from '@/lib/api-client';

/**
 * Fetch and cache the tenant's configured currency code.
 *
 * Every finance page must use this instead of hardcoding a currency or
 * reading currency off individual invoice/payment records. Per-tenant the
 * system supports a single currency — see CLAUDE.md "Permanent Constraints".
 *
 * Returns a safe default ('USD') while loading so that Intl.NumberFormat
 * never receives `undefined` (which produces the "undefined 0.00" bug).
 */
export function useTenantCurrency(): string {
  const [currency, setCurrency] = React.useState<string>('USD');

  React.useEffect(() => {
    let cancelled = false;
    apiClient<{ currency_code: string }>('/api/v1/finance/dashboard/currency')
      .then((res) => {
        if (!cancelled && res.currency_code) setCurrency(res.currency_code);
      })
      .catch((err) => {
        console.error('[useTenantCurrency]', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return currency;
}
