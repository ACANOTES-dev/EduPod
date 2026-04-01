'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncDiffPreviewProps {
  databaseType: 'ppod' | 'pod';
}

interface FieldChange {
  field: string;
  current: string;
  synced: string;
}

interface NewRecord {
  student_id: string;
  student_name: string;
  fields: Record<string, unknown>;
}

interface UpdatedRecord {
  student_id: string;
  student_name: string;
  changes: FieldChange[];
}

interface DiffPreview {
  new_records: NewRecord[];
  updated_records: UpdatedRecord[];
  unchanged_count: number;
}

// ─── Skeletons ───────────────────────────────────────────────────────────────

function DiffSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-surface-secondary p-5">
          <div className="h-4 w-32 rounded bg-border" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-48 rounded bg-border" />
            <div className="h-3 w-36 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  count: number;
  variant: 'success' | 'warning' | 'info' | 'neutral';
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  variant,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-start sm:px-6"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <StatusBadge status={variant} dot>
            {count}
          </StatusBadge>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-text-tertiary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-tertiary" />
        )}
      </button>
      {isOpen && <div className="border-t border-border px-4 py-3 sm:px-6">{children}</div>}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SyncDiffPreview({ databaseType }: SyncDiffPreviewProps) {
  const t = useTranslations('regulatory');

  const [diff, setDiff] = React.useState<DiffPreview | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDiff = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient<DiffPreview>(
        `/api/v1/regulatory/ppod/diff?database_type=${databaseType}`,
        { silent: true },
      );
      setDiff(response);
    } catch (err) {
      console.error('[SyncDiffPreview]', err);
      setError(t('ppod.diffError'));
    } finally {
      setIsLoading(false);
    }
  }, [databaseType, t]);

  React.useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return <DiffSkeleton />;
  }

  // ─── Error ───────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4">
        <p className="text-sm text-danger-text">{error}</p>
      </div>
    );
  }

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (
    !diff ||
    (diff.new_records.length === 0 &&
      diff.updated_records.length === 0 &&
      diff.unchanged_count === 0)
  ) {
    return (
      <div className="rounded-2xl border border-border bg-surface-secondary p-6 text-center">
        <p className="text-sm text-text-secondary">{t('ppod.noChanges')}</p>
      </div>
    );
  }

  const totalChanges = diff.new_records.length + diff.updated_records.length;

  return (
    <div className="space-y-4">
      {/* ─── Summary ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <StatusBadge status="info" dot>
          {t('ppod.newRecordsCount', { count: diff.new_records.length })}
        </StatusBadge>
        <StatusBadge status="warning" dot>
          {t('ppod.updatedRecordsCount', { count: diff.updated_records.length })}
        </StatusBadge>
        <StatusBadge status="neutral" dot>
          {t('ppod.unchangedCount', { count: diff.unchanged_count })}
        </StatusBadge>
      </div>

      {/* ─── No Changes ──────────────────────────────────────────────────── */}
      {totalChanges === 0 && (
        <div className="rounded-2xl border border-border bg-surface-secondary p-6 text-center">
          <p className="text-sm text-text-secondary">{t('ppod.allInSync')}</p>
        </div>
      )}

      {/* ─── New Records ─────────────────────────────────────────────────── */}
      {diff.new_records.length > 0 && (
        <CollapsibleSection
          title={t('ppod.newRecords')}
          count={diff.new_records.length}
          variant="info"
          defaultOpen={diff.new_records.length <= 10}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="py-2 pe-4 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('ppod.studentName')}
                  </th>
                  <th className="py-2 text-start text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t('ppod.fields')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {diff.new_records.map((record) => (
                  <tr key={record.student_id}>
                    <td className="py-2 pe-4 text-text-primary">{record.student_name}</td>
                    <td className="py-2 text-text-secondary">
                      {Object.keys(record.fields).length} {t('ppod.fieldsCount')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* ─── Updated Records ─────────────────────────────────────────────── */}
      {diff.updated_records.length > 0 && (
        <CollapsibleSection
          title={t('ppod.updatedRecords')}
          count={diff.updated_records.length}
          variant="warning"
          defaultOpen={diff.updated_records.length <= 10}
        >
          <div className="space-y-3">
            {diff.updated_records.map((record) => (
              <div
                key={record.student_id}
                className="rounded-xl border border-border bg-surface-secondary p-3"
              >
                <p className="text-sm font-medium text-text-primary">{record.student_name}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1.5 pe-3 text-start font-medium uppercase tracking-wider text-text-tertiary">
                          {t('ppod.field')}
                        </th>
                        <th className="py-1.5 pe-3 text-start font-medium uppercase tracking-wider text-text-tertiary">
                          {t('ppod.currentValue')}
                        </th>
                        <th className="py-1.5 text-start font-medium uppercase tracking-wider text-text-tertiary">
                          {t('ppod.syncedValue')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {record.changes.map((change) => (
                        <tr key={change.field}>
                          <td className="py-1.5 pe-3 font-medium text-text-primary">
                            {change.field}
                          </td>
                          <td className="py-1.5 pe-3 text-danger-text line-through">
                            {change.current || '—'}
                          </td>
                          <td className="py-1.5 text-success-text">{change.synced || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ─── Unchanged ───────────────────────────────────────────────────── */}
      {diff.unchanged_count > 0 && (
        <div className="rounded-2xl border border-border bg-surface-secondary px-4 py-3 sm:px-6">
          <p className="text-sm text-text-secondary">
            {t('ppod.unchangedDescription', { count: diff.unchanged_count })}
          </p>
        </div>
      )}
    </div>
  );
}
