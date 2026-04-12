'use client';

import * as React from 'react';

interface CurrencyDisplayProps {
  amount: number;
  currency_code: string | undefined | null;
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
    // Guard against undefined/null/empty currency — without this Intl throws
    // "Invalid currency code" and the fallback branch prints "undefined 0.00".
    const code =
      typeof currency_code === 'string' && currency_code.trim().length >= 3
        ? currency_code.trim().toUpperCase()
        : 'USD';
    try {
      return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch (err) {
      console.error('[CurrencyDisplay]', err);
      return `${code} ${safeAmount.toFixed(2)}`;
    }
  }, [amount, currency_code, locale]);

  return (
    <span className={className} dir="ltr">
      {formatted}
    </span>
  );
}
