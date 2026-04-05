'use client';

import { DollarSign, FileText, PieChart, CreditCard, Banknote } from 'lucide-react';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

export function AccountingHome({ schoolName }: { schoolName: string }) {
  const financeStats = [
    { label: 'Outstanding Balance', value: '€12,450', icon: DollarSign, color: 'red', href: '/finance/invoices' },
    { label: 'Collected This Month', value: '€48,200', icon: Banknote, color: 'emerald', href: '/finance/payments' },
    { label: 'Unallocated Payments', value: '€1,200', icon: CreditCard, color: 'amber', href: '/finance/payments/unallocated' },
  ];

  const financeActions = [
    { icon: FileText, label: 'New Invoice', href: '/finance/invoices/new' },
    { icon: Banknote, label: 'Record Payment', href: '/finance/payments/new' },
    { icon: PieChart, label: 'Run Report', href: '/finance/reports' },
  ];

  const financePriority = [
    {
      id: 1,
      title: '7 Overdue Invoices',
      description: 'Require immediate follow-up',
      actionLabel: 'Review',
      href: '/finance/invoices?status=overdue',
      icon: DollarSign,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-500/20'
    }
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />
        
        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={financeActions} />
          <SchoolSnapshot variant="compact" customStats={financeStats} title="Finance Overview" />
        </div>

        <PriorityFeed customItems={financePriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" customStats={financeStats} title="Finance Overview" />
        <QuickActions variant="grid" customActions={financeActions} />
      </div>
    </div>
  );
}
