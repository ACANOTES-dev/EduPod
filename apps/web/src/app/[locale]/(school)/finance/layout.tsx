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
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const tabs = [
  { key: 'dashboard', href: '/finance', icon: LayoutDashboard, exact: true },
  { key: 'feeStructures', href: '/finance/fee-structures', icon: Calculator },
  { key: 'discounts', href: '/finance/discounts', icon: Percent },
  { key: 'feeAssignments', href: '/finance/fee-assignments', icon: FileText },
  { key: 'feeGeneration', href: '/finance/fee-generation', icon: Zap },
  { key: 'invoices', href: '/finance/invoices', icon: Receipt },
  { key: 'payments', href: '/finance/payments', icon: CreditCard },
  { key: 'refunds', href: '/finance/refunds', icon: RotateCcw },
  { key: 'statements', href: '/finance/statements', icon: ScrollText },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('finance');
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive = tab.exact
            ? pathname === fullHref
            : pathname.startsWith(fullHref);
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
              {t(tab.key)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
