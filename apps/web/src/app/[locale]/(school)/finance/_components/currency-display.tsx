'use client';

import * as React from 'react';

interface CurrencyDisplayProps {
  amount: number;
  currency_code: string;
  className?: string;
  locale?: string;
}

export function CurrencyDisplay({
  amount,
  currency_code,
  className,
  locale = 'en',
}: CurrencyDisplayProps) {
  const formatted = React.useMemo(() => {
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    try {
      return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
        style: 'currency',
        currency: currency_code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch (err) {
      console.error('[CurrencyDisplay]', err);
      // Fallback if currency code is invalid
      return `${currency_code} ${safeAmount.toFixed(2)}`;
    }
  }, [amount, currency_code, locale]);

  return (
    <span className={className} dir="ltr">
      {formatted}
    </span>
  );
}
