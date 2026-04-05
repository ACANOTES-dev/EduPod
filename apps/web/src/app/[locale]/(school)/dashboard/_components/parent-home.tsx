'use client';

import { CreditCard, FileText, Phone, DollarSign } from 'lucide-react';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

export function ParentHome({ schoolName }: { schoolName: string }) {
  const parentStats = [
    { label: 'Sarah Jenkins', value: 'Year 4', icon: '/avatar.jpg', color: 'emerald', href: '/students/1' },
    { label: 'Balance Due', value: '€450', icon: DollarSign, color: 'red', href: '/finance/invoices' },
  ];

  const parentActions = [
    { icon: CreditCard, label: 'Pay Invoice', href: '/finance/invoices' },
    { icon: FileText, label: 'View Grades', href: '/learning/reports' },
    { icon: Phone, label: 'Contact School', href: '/communications/messages/new' },
  ];

  const parentPriority = [
    {
      id: 1,
      title: 'Term 2 Fee Invoice',
      description: '€450 due in 3 days',
      actionLabel: 'Pay',
      href: '/finance/invoices',
      icon: CreditCard,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-500/20'
    }
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />
        
        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={parentActions} />
          <SchoolSnapshot variant="compact" customStats={parentStats} title="Your Children" />
        </div>

        <PriorityFeed customItems={parentPriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" customStats={parentStats} title="Your Children" />
        <QuickActions variant="grid" customActions={parentActions} />
      </div>
    </div>
  );
}
