'use client';

import * as React from 'react';
import { StatusBadge } from '@school/ui';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface Metric {
  label: string;
  value: React.ReactNode;
}

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface RecordHubProps {
  title: string;
  subtitle?: string;
  status: { label: string; variant: StatusVariant };
  reference?: string;
  actions?: React.ReactNode;
  metrics?: Metric[];
  tabs: Tab[];
  children?: React.ReactNode;
}

export function RecordHub({
  title,
  subtitle,
  status,
  reference,
  actions,
  metrics = [],
  tabs,
  children,
}: RecordHubProps) {
  const [activeTab, setActiveTab] = React.useState(tabs[0]?.key ?? '');

  const activeContent = tabs.find((t) => t.key === activeTab)?.content;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
            <StatusBadge status={status.variant}>{status.label}</StatusBadge>
          </div>
          {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
          {reference && (
            <p className="text-xs font-mono text-text-tertiary">{reference}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* Metrics strip */}
      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface-secondary px-6 py-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-0.5">
              <span className="text-xs text-text-tertiary">{metric.label}</span>
              <span className="text-sm font-semibold text-text-primary">{metric.value}</span>
            </div>
          ))}
        </div>
      )}

      {children}

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-primary-700 text-primary-700'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div>{activeContent}</div>
      </div>
    </div>
  );
}
