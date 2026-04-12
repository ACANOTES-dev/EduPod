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
 *
 * FIN-025: the result is cached in a module-scoped promise so that N
 * <CurrencyDisplay> instances on one page share a single network request.
 * Subsequent mounts in the same session read from the cache.
 */

let cachedCurrency: string | null = null;
let inFlight: Promise<string> | null = null;

function fetchCurrency(): Promise<string> {
  if (cachedCurrency) return Promise.resolve(cachedCurrency);
  if (inFlight) return inFlight;

  inFlight = apiClient<{ currency_code?: string; data?: { currency_code?: string } }>(
    `/api/v1/finance/dashboard/currency?_t=${Date.now()}`,
  )
    .then((res) => {
      const code = res?.data?.currency_code ?? res?.currency_code ?? 'USD';
      cachedCurrency = code;
      return code;
    })
    .catch((err) => {
      console.error('[useTenantCurrency]', err);
      return 'USD';
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useTenantCurrency(): string {
  const [currency, setCurrency] = React.useState<string>(cachedCurrency ?? 'USD');

  React.useEffect(() => {
    if (cachedCurrency) return;
    let cancelled = false;
    void fetchCurrency().then((code) => {
      if (!cancelled) setCurrency(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return currency;
}

/**
 * Clear the module cache — for use only after tenant currency changes
 * (e.g. in settings/general page). Not exported widely.
 */
export function resetTenantCurrencyCache(): void {
  cachedCurrency = null;
  inFlight = null;
}
