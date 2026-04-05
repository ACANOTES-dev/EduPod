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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[16px] font-semibold text-text-primary">Needs Your Attention</h3>
          <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-danger-fill text-[10px] font-bold text-danger-text">
            {items.length}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl p-2 hover:bg-surface-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${item.iconBg}`}
                >
                  <Icon className={`h-4 w-4 ${item.iconColor}`} />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-text-primary">{item.title}</p>
                  <p className="text-[12px] text-text-tertiary">{item.description}</p>
                </div>
              </div>
              <Link
                href={item.href}
                className="rounded-pill bg-primary-50 px-3 py-1.5 text-[12px] font-semibold text-primary-600 hover:bg-primary-100 transition-colors"
              >
                {item.actionLabel}
              </Link>
            </div>
          );
        })}
      </div>
      <Link
        href="/approvals"
        className="mt-2 text-center text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        View all pending items &rarr;
      </Link>
    </div>
  );
}
