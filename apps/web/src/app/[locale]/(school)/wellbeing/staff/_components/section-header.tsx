import * as React from 'react';

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function SectionHeader({ icon, title, description, actions }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
