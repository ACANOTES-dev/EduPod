'use client';

import { BookOpen, FileDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, cn } from '@school/ui';


import { RegulatoryNav } from '../_components/regulatory-nav';

import { ReadinessChecklist } from './_components/readiness-checklist';
import type { ReadinessCategory } from './_components/readiness-checklist';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReadinessResponse {
  status: 'pass' | 'fail' | 'warning';
  categories: ReadinessCategory[];
}

// ─── Action Card ──────────────────────────────────────────────────────────────

interface ActionCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

function ActionCard({ href, icon: Icon, title, description }: ActionCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-3 rounded-2xl border border-border bg-surface-primary p-5',
        'transition-colors hover:border-primary-300 hover:bg-surface-secondary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-100">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DESReturnsPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();

  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';
  const basePath = `/${locale}/regulatory/des-returns`;

  const [academicYear, setAcademicYear] = React.useState('2025-2026');
  const [draftYear, setDraftYear] = React.useState('2025-2026');
  const [readiness, setReadiness] = React.useState<ReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchReadiness = React.useCallback(async (year: string) => {
    setIsLoading(true);
    try {
      const data = await apiClient<ReadinessResponse>(
        `/api/v1/regulatory/des/readiness?academic_year=${encodeURIComponent(year)}`,
        { silent: true },
      );
      setReadiness(data);
    } catch (err) {
      console.error('[DESReturnsPage.fetchReadiness]', err);
      setReadiness(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchReadiness(academicYear);
  }, [fetchReadiness, academicYear]);

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

  return (
    <div className="space-y-6">
      <PageHeader title={t('desReturns.pageTitle')} description={t('desReturns.pageDescription')} />

      <RegulatoryNav />

      {/* ─── Academic Year Selector ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="academic-year">{t('desReturns.academicYear')}</Label>
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
            {t('desReturns.applyYear')}
          </Button>
        </div>
      </div>

      {/* ─── Readiness Checklist ──────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-text-primary">
          {t('desReturns.readinessTitle')}
        </h2>
        <ReadinessChecklist categories={readiness?.categories ?? []} isLoading={isLoading} />
      </div>

      {/* ─── Action Cards ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-text-primary">
          {t('desReturns.actionsTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href={`${basePath}/subject-mappings`}
            icon={BookOpen}
            title={t('desReturns.subjectMappingsTitle')}
            description={t('desReturns.subjectMappingsDescription')}
          />
          <ActionCard
            href={`${basePath}/generate`}
            icon={FileDown}
            title={t('desReturns.generateFilesTitle')}
            description={t('desReturns.generateFilesDescription')}
          />
        </div>
      </div>
    </div>
  );
}
