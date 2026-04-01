'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Badge } from '@school/ui';

import type { LinkedIncident } from './intervention-types';
import { STATUS_COLORS } from './intervention-types';

import { formatDate } from '@/lib/format-date';

// ─── Props ───────────────────────────────────────────────────────────────────

interface IncidentsTabProps {
  linkedIncidents: LinkedIncident[];
  incidentsLoading: boolean;
  locale: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IncidentsTab({ linkedIncidents, incidentsLoading, locale }: IncidentsTabProps) {
  const t = useTranslations('behaviour.interventionDetail');

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">
        Linked Incidents ({linkedIncidents.length})
      </h3>

      {incidentsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : linkedIncidents.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">{t('noLinkedIncidents')}</p>
      ) : (
        <div className="space-y-2">
          {linkedIncidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/${locale}/behaviour/incidents/${inc.id}`}
              className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-tertiary">
                      {inc.incident_number}
                    </span>
                    {inc.category && (
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        style={
                          inc.category.color
                            ? {
                                borderColor: inc.category.color,
                                color: inc.category.color,
                              }
                            : undefined
                        }
                      >
                        {inc.category.name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-text-secondary">{inc.description}</p>
                </div>
                <div className="shrink-0 text-end">
                  <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${STATUS_COLORS[inc.status] ?? ''}`}
                  >
                    {inc.status.replace(/_/g, ' ')}
                  </Badge>
                  <p className="mt-1 font-mono text-xs text-text-tertiary">
                    {formatDate(inc.occurred_at)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
