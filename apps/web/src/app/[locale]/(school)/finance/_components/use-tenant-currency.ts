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
    // Cache-bust the request — a 304 Not Modified from the browser would make
    // apiClient throw (response.ok is false) and leave the hook at its 'USD'
    // default forever. A changing query string bypasses the browser cache so
    // we always see the real body.
    // The backend ResponseTransformInterceptor wraps every response in
    // `{ data: T }`. Older call sites read res.currency_code directly and
    // silently failed — leaving the hook stuck on 'USD'. Accept both shapes.
    apiClient<{ currency_code?: string; data?: { currency_code?: string } }>(
      `/api/v1/finance/dashboard/currency?_t=${Date.now()}`,
    )
      .then((res) => {
        const code = res?.data?.currency_code ?? res?.currency_code;
        if (!cancelled && code) setCurrency(code);
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
