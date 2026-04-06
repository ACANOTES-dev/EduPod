'use client';
import { ClipboardCheck, CreditCard, Search, Send, UserPlus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

type QuickAction = {
  icon: LucideIcon;
  label: string;
  href: string;
  /** When true, the button spans the full grid width (col-span-2) in grid variant */
  fullWidth?: boolean;
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { icon: UserPlus, label: 'Register New Family', href: '/households?action=register' },
  { icon: Users, label: 'Register New Student', href: '/households' },
  { icon: CreditCard, label: 'Record Payment', href: '/finance/payments/new' },
  { icon: ClipboardCheck, label: 'Take Attendance', href: '/attendance' },
  { icon: Send, label: 'Send Announcement', href: '/communications', fullWidth: true },
  { icon: Search, label: 'Find Student', href: '/students', fullWidth: true },
];

export function QuickActions({
  variant = 'grid',
  customActions,
}: {
  variant?: 'grid' | 'horizontal';
  customActions?: QuickAction[];
}) {
  const actions = customActions ?? DEFAULT_ACTIONS;

  if (variant === 'horizontal') {
    return (
      <div className="flex overflow-x-auto gap-2 pb-2 snap-x">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-2 bg-surface-secondary rounded-[10px] px-3 py-2.5 transition-colors group hover:bg-primary-50 hover:text-primary-700 shrink-0 snap-center whitespace-nowrap"
            >
              <Icon className="h-4 w-4 text-text-secondary group-hover:text-primary-600 transition-colors" />
              <span className="text-[12px] font-medium text-text-primary group-hover:text-primary-700 transition-colors">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            className={cn(
              'flex items-center gap-2 bg-surface-secondary rounded-[10px] px-3 py-2.5 transition-colors group hover:bg-primary-50 hover:text-primary-700',
              action.fullWidth && 'col-span-2',
            )}
          >
            <Icon className="h-4 w-4 text-text-secondary group-hover:text-primary-600 transition-colors" />
            <span className="text-[12px] font-medium text-text-primary group-hover:text-primary-700 transition-colors">
              {action.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
