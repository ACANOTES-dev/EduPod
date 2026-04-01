'use client';

import { ClipboardList, Copy, Edit2, Play, Plus, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
} from '@school/ui';

import { PAGE_SIZE, STATUSES, STATUS_COLORS, formatDateRange } from './survey-types';
import type { Survey, SurveyStatus } from './survey-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SurveyListProps {
  surveys: Survey[];
  isLoading: boolean;
  page: number;
  total: number;
  statusFilter: SurveyStatus | 'all';
  onStatusFilterChange: (status: SurveyStatus | 'all') => void;
  onPageChange: (page: number) => void;
  onCreateClick: () => void;
  onEditClick: (survey: Survey) => void;
  onCloneClick: (surveyId: string) => void;
  onActivateClick: (surveyId: string) => void;
  onCloseClick: (surveyId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SurveyList({
  surveys,
  isLoading,
  page,
  total,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onCreateClick,
  onEditClick,
  onCloneClick,
  onActivateClick,
  onCloseClick,
}: SurveyListProps) {
  const t = useTranslations('wellbeing.surveys');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Response rate display ───────────────────────────────────────────────────

  function renderResponseRate(survey: Survey): React.ReactNode {
    if (survey.status === 'draft') return null;
    if (survey.status === 'active') {
      return <span className="text-sm text-text-secondary">{t('inProgress')}</span>;
    }

    const count = survey.participation_count ?? survey._count?.survey_responses ?? 0;
    const eligible = survey.eligible_count ?? 0;
    const rate = eligible > 0 ? Math.round((count / eligible) * 100) : 0;

    return (
      <span className="text-sm text-text-secondary">
        {t('responses', { count, total: eligible, rate })}
      </span>
    );
  }

  // ── Status actions ──────────────────────────────────────────────────────────

  function renderActions(survey: Survey): React.ReactNode {
    switch (survey.status) {
      case 'draft':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEditClick(survey)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Edit2 className="me-1.5 h-3.5 w-3.5" />
              {t('edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCloneClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onActivateClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Play className="me-1.5 h-3.5 w-3.5" />
              {t('activate')}
            </Button>
          </div>
        );
      case 'active':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCloseClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Square className="me-1.5 h-3.5 w-3.5" />
              {t('close')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCloneClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
      case 'closed':
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px]">
              <ClipboardList className="me-1.5 h-3.5 w-3.5" />
              {t('viewResults')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCloneClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
      case 'archived':
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCloneClick(survey.id)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {t('clone')}
            </Button>
          </div>
        );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Status filter */}
      <div className="w-full sm:w-48">
        <Select
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v as SurveyStatus | 'all')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? t('allStatuses') : t(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && surveys.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <ClipboardList className="h-8 w-8 text-text-tertiary" />
          </div>
          <p className="max-w-sm text-center text-sm text-text-secondary">{t('noSurveys')}</p>
          <Button onClick={onCreateClick}>
            <Plus className="me-1.5 h-4 w-4" />
            {t('createSurvey')}
          </Button>
        </div>
      )}

      {/* Desktop table */}
      {!isLoading && surveys.length > 0 && (
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="pb-3 pe-4 text-start font-medium">{t('surveyTitle')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('status')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('window')}</th>
                  <th className="pb-3 pe-4 text-start font-medium">{t('responseRate')}</th>
                  <th className="pb-3 text-end font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((survey) => (
                  <tr key={survey.id} className="border-b border-border last:border-b-0">
                    <td className="py-4 pe-4 font-medium text-text-primary">{survey.title}</td>
                    <td className="py-4 pe-4">
                      <Badge className={STATUS_COLORS[survey.status]}>{t(survey.status)}</Badge>
                    </td>
                    <td className="py-4 pe-4 text-text-secondary" dir="ltr">
                      {formatDateRange(survey.window_opens_at, survey.window_closes_at)}
                    </td>
                    <td className="py-4 pe-4">{renderResponseRate(survey)}</td>
                    <td className="py-4 text-end">{renderActions(survey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile card view */}
      {!isLoading && surveys.length > 0 && (
        <div className="space-y-3 md:hidden">
          {surveys.map((survey) => (
            <div key={survey.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-medium text-text-primary">{survey.title}</h3>
                <Badge className={STATUS_COLORS[survey.status]}>{t(survey.status)}</Badge>
              </div>
              <p className="mt-2 text-xs text-text-secondary" dir="ltr">
                {formatDateRange(survey.window_opens_at, survey.window_closes_at)}
              </p>
              {renderResponseRate(survey) && (
                <div className="mt-1">{renderResponseRate(survey)}</div>
              )}
              <Separator className="my-3" />
              {renderActions(survey)}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="min-h-[44px] min-w-[44px]"
          >
            &lsaquo;
          </Button>
          <span className="text-sm text-text-secondary" dir="ltr">
            {t('page', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="min-h-[44px] min-w-[44px]"
          >
            &rsaquo;
          </Button>
        </div>
      )}
    </div>
  );
}
