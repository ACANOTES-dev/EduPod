'use client';
import { UserPlus, ClipboardCheck, FileText, Send, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

type QuickAction = {
  icon: LucideIcon;
  label: string;
  href: string;
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { icon: UserPlus, label: 'Register Family', href: '/admissions' },
  { icon: ClipboardCheck, label: 'Take Attendance', href: '/attendance' },
  { icon: FileText, label: 'New Invoice', href: '/finance/invoices' },
  { icon: Send, label: 'Send Announcement', href: '/communications' },
  { icon: Search, label: 'Find Student', href: '/students' },
];

export function QuickActions({
  variant = 'grid',
  customActions,
}: {
  variant?: 'grid' | 'horizontal';
  customActions?: QuickAction[];
}) {
  const actions = customActions ?? DEFAULT_ACTIONS;

  return (
    <div
      className={cn(
        variant === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex overflow-x-auto gap-2 pb-2 snap-x',
      )}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            className={cn(
              'flex items-center gap-2 bg-surface-secondary rounded-[10px] px-3 py-2.5 transition-colors group hover:bg-primary-50 hover:text-primary-700',
              variant === 'horizontal' && 'shrink-0 snap-center whitespace-nowrap',
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
