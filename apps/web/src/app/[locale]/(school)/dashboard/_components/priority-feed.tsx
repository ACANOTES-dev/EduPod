'use client';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

type PriorityItem = {
  id: number | string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

const DEFAULT_ITEMS: PriorityItem[] = [
  {
    id: 1,
    icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: '7 Overdue Invoices',
    description: '€4,250 total requires collection',
    actionLabel: 'Review',
    href: '/finance/invoices?status=overdue',
  },
  {
    id: 2,
    icon: AlertTriangle,
    iconBg: 'bg-red-100 dark:bg-red-500/20',
    iconColor: 'text-red-600 dark:text-red-400',
    title: '3 Unresolved Incidents',
    description: 'Behaviour incidents logged today',
    actionLabel: 'Resolve',
    href: '/behaviour/incidents',
  },
  {
    id: 3,
    icon: RefreshCw,
    iconBg: 'bg-blue-100 dark:bg-blue-500/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    title: 'Pending Staff Leave',
    description: '2 requests waiting for approval',
    actionLabel: 'Approve',
    href: '/staff?tab=leave',
  },
];

export function PriorityFeed({ customItems }: { customItems?: PriorityItem[] }) {
  const items = customItems ?? DEFAULT_ITEMS;

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <h3 className="text-[16px] font-semibold text-text-primary">Needs Your Attention</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="flex flex-col rounded-xl border border-border bg-surface p-4 gap-3"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${item.iconBg}`}
              >
                <Icon className={`h-5 w-5 ${item.iconColor}`} />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-text-primary">{item.title}</p>
                <p className="text-[12px] text-text-tertiary mt-0.5">{item.description}</p>
              </div>
              <Link
                href={item.href}
                className="block w-full rounded-lg bg-primary-700 px-4 py-2.5 text-center text-[13px] font-semibold text-btn-primary-text hover:bg-primary-800 transition-colors"
              >
                {item.actionLabel}
              </Link>
            </div>
          );
        })}
      </div>
      <Link
        href="/approvals"
        className="text-center text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        View all pending items &rarr;
      </Link>
    </div>
  );
}
