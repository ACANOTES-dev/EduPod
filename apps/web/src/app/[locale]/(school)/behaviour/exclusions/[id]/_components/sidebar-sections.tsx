'use client';

import { Calendar, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';


import type { ExclusionDetail } from './exclusion-types';
import { APPEAL_STATUS_COLORS, formatLabel, getDaysRemaining } from './exclusion-types';

import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Appeal Sidebar ───────────────────────────────────────────────────────────

interface AppealSidebarProps {
  exclusion: ExclusionDetail;
  locale: string;
  onMarkFinalised: () => void;
}

export function AppealSidebar({ exclusion, locale, onMarkFinalised }: AppealSidebarProps) {
  const t = useTranslations('behaviour.exclusionDetail');
  const appealDays = getDaysRemaining(exclusion.appeal_deadline);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sections.appeal')}</h3>
      </div>

      {exclusion.appeal_deadline && (
        <div className="mb-3">
          <p className="text-xs text-text-tertiary">Appeal Deadline</p>
          <p className="text-sm font-medium text-text-primary">
            {formatDate(exclusion.appeal_deadline)}
          </p>
          {appealDays !== null && (
            <span
              className={`mt-1 inline-block text-xs font-medium ${
                appealDays < 0
                  ? 'text-red-600 dark:text-red-400'
                  : appealDays < 3
                    ? 'text-red-600 dark:text-red-400'
                    : appealDays < 5
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
              }`}
            >
              {appealDays < 0
                ? 'Expired'
                : appealDays === 0
                  ? 'Expires today'
                  : `${appealDays} days remaining`}
            </span>
          )}
        </div>
      )}

      {exclusion.appeal ? (
        <div className="space-y-2 rounded-lg bg-surface-secondary p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {exclusion.appeal.appeal_number}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${APPEAL_STATUS_COLORS[exclusion.appeal.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              {formatLabel(exclusion.appeal.status)}
            </span>
          </div>
          <p className="text-xs text-text-tertiary">
            Grounds: {formatLabel(exclusion.appeal.grounds_category)}
          </p>
          <Link
            href={`/${locale}/behaviour/appeals/${exclusion.appeal.id}`}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
          >
            View Appeal <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div>
          <p className="text-xs text-text-tertiary">{t('noAppeal')}</p>
          {exclusion.status === 'appeal_window' && appealDays !== null && appealDays < 0 && (
            <Button className="mt-2" size="sm" onClick={onMarkFinalised}>
              {t('markFinalised')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Case Meta Sidebar ────────────────────────────────────────────────────────

interface CaseMetaSidebarProps {
  exclusion: ExclusionDetail;
}

export function CaseMetaSidebar({ exclusion }: CaseMetaSidebarProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.details')}</h3>
      <dl className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
          <div>
            <dt className="text-xs text-text-tertiary">Created</dt>
            <dd className="text-text-primary">{formatDateTime(exclusion.created_at)}</dd>
          </div>
        </div>
        {exclusion.incident?.category && (
          <div>
            <dt className="text-xs text-text-tertiary">Incident Category</dt>
            <dd className="text-text-primary">
              {exclusion.incident.category.name} (Severity: {exclusion.incident.category.severity}
              /10)
            </dd>
          </div>
        )}
        {exclusion.student?.year_group && (
          <div>
            <dt className="text-xs text-text-tertiary">Year Group</dt>
            <dd className="text-text-primary">{exclusion.student.year_group.name}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
