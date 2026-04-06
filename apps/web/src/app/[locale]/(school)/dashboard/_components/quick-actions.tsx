'use client';
import { ClipboardCheck, CreditCard, Search, Send, UserPlus, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

type QuickAction = {
  icon: LucideIcon;
  label: string;
  /** Navigation URL — mutually exclusive with onClick */
  href?: string;
  /** Click handler for actions that don't navigate (e.g., open a wizard) */
  onClick?: () => void;
  /** When true, the button spans the full grid width (col-span-2) in grid variant */
  fullWidth?: boolean;
};

function openRegistrationWizard() {
  window.dispatchEvent(new CustomEvent('open-registration-wizard'));
}

export function QuickActions({
  variant = 'grid',
  customActions,
}: {
  variant?: 'grid' | 'horizontal';
  customActions?: QuickAction[];
}) {
  const t = useTranslations('dashboard');

  const defaultActions: QuickAction[] = [
    { icon: UserPlus, label: t('registerNewFamily'), onClick: openRegistrationWizard },
    { icon: Users, label: t('registerNewStudent'), href: '/households' },
    { icon: CreditCard, label: t('recordPayment'), href: '/finance/payments/new' },
    { icon: ClipboardCheck, label: t('takeAttendance'), href: '/attendance' },
    { icon: Send, label: t('sendAnnouncement'), href: '/communications', fullWidth: true },
    { icon: Search, label: t('findStudent'), href: '/students', fullWidth: true },
  ];

  const actions = customActions ?? defaultActions;

  const sharedClasses =
    'flex items-center gap-2 bg-surface-secondary rounded-[10px] px-3 py-2.5 transition-colors group hover:bg-primary-50 hover:text-primary-700';

  function renderAction(action: QuickAction, extra?: string) {
    const Icon = action.icon;
    const content = (
      <>
        <Icon className="h-4 w-4 text-text-secondary group-hover:text-primary-600 transition-colors" />
        <span className="text-[12px] font-medium text-text-primary group-hover:text-primary-700 transition-colors">
          {action.label}
        </span>
      </>
    );

    if (action.onClick) {
      return (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={cn(sharedClasses, extra)}
        >
          {content}
        </button>
      );
    }

    return (
      <Link key={action.label} href={action.href ?? '#'} className={cn(sharedClasses, extra)}>
        {content}
      </Link>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className="flex overflow-x-auto gap-2 pb-2 snap-x">
        {actions.map((a) => renderAction(a, 'shrink-0 snap-center whitespace-nowrap'))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((a) => renderAction(a, a.fullWidth ? 'col-span-2' : undefined))}
    </div>
  );
}
