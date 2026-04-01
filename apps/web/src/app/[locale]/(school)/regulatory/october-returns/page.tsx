'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, StatusBadge, cn } from '@school/ui';

import { RegulatoryNav } from '../_components/regulatory-nav';

import { ReadinessOverview } from './_components/readiness-overview';
import { ReturnsPreview } from './_components/returns-preview';
import { StudentIssuesTable } from './_components/student-issues-table';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

type ReadinessStatus = 'pass' | 'fail' | 'warning';

interface OctoberReadinessResponse {
  status: ReadinessStatus;
  academic_year: string;
  total_students: number;
  categories: Array<{
    name: string;
    status: ReadinessStatus;
    message: string;
    details?: { total: number; valid: number; issues: number };
  }>;
}

interface OctoberPreviewResponse {
  academic_year: string;
  generated_at: string;
  summary: {
    total_students: number;
    gender: { male: number; female: number; other: number };
    nationalities: Array<{ nationality: string; count: number }>;
    year_groups: Array<{ year_group: string; count: number }>;
    new_entrants: number;
  };
}

type Severity = 'error' | 'warning';

interface OctoberIssuesResponse {
  academic_year: string;
  total_students: number;
  students_with_issues: number;
  issues: Array<{
    student_id: string;
    student_name: string;
    student_number: string | null;
    problems: Array<{ field: string; message: string; severity: Severity }>;
  }>;
}

type ActiveTab = 'readiness' | 'preview' | 'issues';

// ─── Status Banner Helpers ──────────────────────────────────────────────────

const BANNER_STYLE: Record<ReadinessStatus, string> = {
  pass: 'border-success-text/20 bg-success-text/5 text-success-text',
  warning: 'border-warning-text/20 bg-warning-text/5 text-warning-text',
  fail: 'border-danger-text/20 bg-danger-text/5 text-danger-text',
};

const BANNER_BADGE: Record<ReadinessStatus, 'success' | 'warning' | 'danger'> = {
  pass: 'success',
  warning: 'warning',
  fail: 'danger',
};

function bannerMessage(status: ReadinessStatus, t: (key: string) => string): string {
  switch (status) {
    case 'pass':
      return t('octoberReturns.bannerPass');
    case 'warning':
      return t('octoberReturns.bannerWarning');
    case 'fail':
      return t('octoberReturns.bannerFail');
  }
}

function bannerLabel(status: ReadinessStatus, t: (key: string) => string): string {
  switch (status) {
    case 'pass':
      return t('octoberReturns.statusPass');
    case 'warning':
      return t('octoberReturns.statusWarning');
    case 'fail':
      return t('octoberReturns.statusFail');
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OctoberReturnsPage() {
  const t = useTranslations('regulatory');

  // Academic year state
  const [academicYear, setAcademicYear] = React.useState('2025-2026');
  const [draftYear, setDraftYear] = React.useState('2025-2026');

  // Active tab
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('readiness');

  // Data state
  const [readiness, setReadiness] = React.useState<OctoberReadinessResponse | null>(null);
  const [preview, setPreview] = React.useState<OctoberPreviewResponse | null>(null);
  const [issues, setIssues] = React.useState<OctoberIssuesResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchAll = React.useCallback(async (year: string) => {
    setIsLoading(true);
    const yearParam = encodeURIComponent(year);

    try {
      const [readinessRes, previewRes, issuesRes] = await Promise.all([
        apiClient<OctoberReadinessResponse>(
          `/api/v1/regulatory/october-returns/readiness?academic_year=${yearParam}`,
          { silent: true },
        ),
        apiClient<OctoberPreviewResponse>(
          `/api/v1/regulatory/october-returns/preview?academic_year=${yearParam}`,
          { silent: true },
        ),
        apiClient<OctoberIssuesResponse>(
          `/api/v1/regulatory/october-returns/issues?academic_year=${yearParam}`,
          { silent: true },
        ),
      ]);

      setReadiness(readinessRes);
      setPreview(previewRes);
      setIssues(issuesRes);
    } catch (err) {
      console.error('[OctoberReturnsPage.fetchAll]', err);
      setReadiness(null);
      setPreview(null);
      setIssues(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAll(academicYear);
  }, [fetchAll, academicYear]);

  // ─── Year Controls ──────────────────────────────────────────────────────

  function handleYearApply() {
    const trimmed = draftYear.trim();
    if (trimmed && trimmed !== academicYear) {
      setAcademicYear(trimmed);
    }
  }

  function handleYearKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleYearApply();
    }
  }

  // ─── Tab Definitions ────────────────────────────────────────────────────

  const TABS: Array<{ key: ActiveTab; labelKey: string }> = [
    { key: 'readiness', labelKey: 'octoberReturns.tabReadiness' },
    { key: 'preview', labelKey: 'octoberReturns.tabPreview' },
    { key: 'issues', labelKey: 'octoberReturns.tabIssues' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('octoberReturns.pageTitle')}
        description={t('octoberReturns.pageDescription')}
      />

      <RegulatoryNav />

      {/* ─── Academic Year Selector ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="academic-year">{t('octoberReturns.academicYear')}</Label>
            <Input
              id="academic-year"
              value={draftYear}
              onChange={(e) => setDraftYear(e.target.value)}
              onKeyDown={handleYearKeyDown}
              placeholder="e.g. 2025-2026"
              className="w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleYearApply} disabled={isLoading}>
            {t('octoberReturns.applyYear')}
          </Button>
        </div>
      </div>

      {/* ─── Overall Status Banner ──────────────────────────────────────── */}
      {!isLoading && readiness && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-2xl border p-4',
            BANNER_STYLE[readiness.status],
          )}
        >
          <StatusBadge status={BANNER_BADGE[readiness.status]} dot>
            {bannerLabel(readiness.status, t)}
          </StatusBadge>
          <span className="text-sm font-medium">{bannerMessage(readiness.status, t)}</span>
        </div>
      )}

      {/* ─── Tab Switcher ───────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-surface-secondary p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              activeTab === tab.key
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* ─── Active View ────────────────────────────────────────────────── */}
      {activeTab === 'readiness' && <ReadinessOverview data={readiness} isLoading={isLoading} />}
      {activeTab === 'preview' && <ReturnsPreview data={preview} isLoading={isLoading} />}
      {activeTab === 'issues' && <StudentIssuesTable data={issues} isLoading={isLoading} />}
    </div>
  );
}
