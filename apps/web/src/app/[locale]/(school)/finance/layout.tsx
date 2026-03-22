'use client';

import {
  Calculator,
  CreditCard,
  FileText,
  LayoutDashboard,
  Percent,
  Receipt,
  RotateCcw,
  ScrollText,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

const tabs = [
  { key: 'dashboard', label: 'navDashboard', href: '/finance', icon: LayoutDashboard, exact: true },
  { key: 'feeStructures', label: 'navFeeStructures', href: '/finance/fee-structures', icon: Calculator },
  { key: 'discounts', label: 'navDiscounts', href: '/finance/discounts', icon: Percent },
  { key: 'feeAssignments', label: 'navFeeAssignments', href: '/finance/fee-assignments', icon: FileText },
  { key: 'feeGeneration', label: 'navFeeGeneration', href: '/finance/fee-generation', icon: Zap },
  { key: 'invoices', label: 'navInvoices', href: '/finance/invoices', icon: Receipt },
  { key: 'payments', label: 'navPayments', href: '/finance/payments', icon: CreditCard },
  { key: 'refunds', label: 'navRefunds', href: '/finance/refunds', icon: RotateCcw },
  { key: 'statements', label: 'navStatements', href: '/finance/statements', icon: ScrollText },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('finance');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div>
      <nav className="sticky top-0 z-10 bg-surface flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive = tab.exact
            ? pathname === fullHref
            : (pathname ?? '').startsWith(fullHref);
          return (
            <Link
              key={tab.key}
              href={fullHref}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {t(tab.label)}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
