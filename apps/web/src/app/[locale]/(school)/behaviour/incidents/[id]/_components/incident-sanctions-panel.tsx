'use client';

import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface SanctionRow {
  id: string;
  sanction_number: string;
  type: string;
  status: string;
  scheduled_date: string | null;
  student: { id: string; first_name: string; last_name: string } | null;
}

interface SanctionsResponse {
  data: SanctionRow[];
  meta: { page: number; pageSize: number; total: number };
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'warning' | 'danger' | 'success'> = {
  scheduled: 'warning',
  served: 'success',
  pending_approval: 'secondary',
  approved: 'success',
  appealed: 'warning',
  withdrawn: 'secondary',
  expired: 'secondary',
};

interface IncidentSanctionsPanelProps {
  incidentId: string;
  locale: string;
}

export function IncidentSanctionsPanel({ incidentId, locale }: IncidentSanctionsPanelProps) {
  const t = useTranslations('behaviour.incidentDetail.sanctionsPanel');
  const [rows, setRows] = React.useState<SanctionRow[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!incidentId) return;
    setLoading(true);
    apiClient<SanctionsResponse>(
      `/api/v1/behaviour/sanctions?incident_id=${incidentId}&page=1&pageSize=10`,
    )
      .then((res) => {
        setRows(res.data ?? []);
        setTotal(res.meta?.total ?? res.data?.length ?? 0);
      })
      .catch((err) => {
        console.error('[IncidentSanctionsPanel]', err);
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [incidentId]);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
        <Link
          href={`/${locale}/behaviour/sanctions/new?incident_id=${incidentId}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-surface-hover"
        >
          <Plus className="h-3 w-3" />
          {t('logOne')}
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/${locale}/behaviour/sanctions/${row.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {row.sanction_number}
                    </span>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'} className="text-xs">
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    <span className="capitalize">{row.type.replace(/_/g, ' ')}</span>
                    {row.student && (
                      <>
                        {' · '}
                        {row.student.first_name} {row.student.last_name}
                      </>
                    )}
                    {row.scheduled_date && (
                      <>
                        {' · '}
                        {formatDateTime(row.scheduled_date)}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180" />
              </Link>
            </li>
          ))}
          {total > rows.length && (
            <li>
              <Link
                href={`/${locale}/behaviour/sanctions?incident_id=${incidentId}`}
                className="block rounded-lg px-3 py-1.5 text-center text-xs font-medium text-primary-700 transition-colors hover:bg-surface-hover"
              >
                {t('viewAll', { count: total })}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
