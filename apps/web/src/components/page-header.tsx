import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

interface PageHeaderBack {
  href: string;
  label?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: PageHeaderBack;
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {back && (
          <Link
            href={back.href}
            aria-label={back.label ?? 'Back'}
            className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="mt-3 flex items-center gap-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
