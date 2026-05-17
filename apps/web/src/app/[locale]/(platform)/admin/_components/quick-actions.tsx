'use client';

import { Activity, AlertTriangle, Building2, Lightbulb, Plus, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { cn } from '@school/ui';

interface QuickActionsProps {
  className?: string;
}

const actions = [
  {
    label: 'Create Tenant',
    description: 'Start a new school tenant',
    href: '/admin/tenants/new',
    icon: Plus,
  },
  {
    label: 'View Queues',
    description: 'Inspect background jobs',
    href: '/admin/queues',
    icon: Workflow,
  },
  {
    label: 'View Alerts',
    description: 'Review alert history',
    href: '/admin/alerts',
    icon: AlertTriangle,
  },
  {
    label: 'View Health',
    description: 'Open dependency health',
    href: '/admin/health',
    icon: Activity,
  },
  {
    label: 'Fix Recommendations',
    description: 'Generate cited manual advice',
    href: '/admin/copilot/recommendations',
    icon: Lightbulb,
  },
];

export function QuickActions({ className }: QuickActionsProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  return (
    <section className={cn('rounded-lg border border-border bg-surface p-5 shadow-sm', className)}>
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-text-tertiary" />
        <h2 className="text-sm font-semibold text-text-primary">Quick Actions</h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={`/${locale}${action.href}`}
            className="group flex min-h-16 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-start transition-colors hover:border-border-strong hover:bg-surface-secondary"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <action.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">{action.label}</span>
              <span className="block truncate text-xs text-text-secondary">
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
