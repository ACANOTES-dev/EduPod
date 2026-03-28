'use client';

import { cn } from '@school/ui';
import * as React from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ComplianceStatusItem {
  label: string;
  value: string | number;
  variant?: 'success' | 'warning' | 'danger' | 'neutral';
}

interface ComplianceStatusCardProps {
  title: string;
  items: ComplianceStatusItem[];
  footer?: React.ReactNode;
}

// ─── Variant Colour Map ─────────────────────────────────────────────────────

const VARIANT_CLASSES: Record<string, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  neutral: 'text-text-secondary',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ComplianceStatusCard({ title, items, footer }: ComplianceStatusCardProps) {
  return (
    <div className="rounded-2xl bg-surface-secondary p-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-tertiary">{item.label}</span>
            <span
              className={cn(
                'text-sm font-medium',
                VARIANT_CLASSES[item.variant ?? 'neutral'] ?? 'text-text-secondary',
              )}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {footer && (
        <div className="mt-3 border-t border-border pt-3 text-xs text-text-tertiary">
          {footer}
        </div>
      )}
    </div>
  );
}
