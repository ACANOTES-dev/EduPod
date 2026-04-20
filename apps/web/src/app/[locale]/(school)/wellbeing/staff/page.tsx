'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';

import { AggregateSection } from './_components/aggregate-section';
import { BoardReportSection } from './_components/board-report-section';
import { computeStaffSections } from './_components/compute-staff-sections';
import { InPageNav } from './_components/in-page-nav';
import { MyWorkloadSection } from './_components/my-workload-section';
import { ResourcesSection } from './_components/resources-section';
import { SurveysSection } from './_components/surveys-section';

export default function StaffWellbeingPage() {
  const t = useTranslations('wellbeingStaff');
  const { hasAnyRole } = useRoleCheck();

  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal', 'admin');

  const sections = React.useMemo(
    () =>
      computeStaffSections(isAdmin, {
        my: t('nav.my'),
        aggregate: t('nav.aggregate'),
        surveys: t('nav.surveys'),
        boardReport: t('nav.boardReport'),
        resources: t('nav.resources'),
      }),
    [isAdmin, t],
  );

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title={t('title')} description={t('description')} />

      <InPageNav sections={sections} />

      <div className="space-y-10">
        <MyWorkloadSection />
        {isAdmin && (
          <>
            <AggregateSection />
            <SurveysSection />
            <BoardReportSection />
          </>
        )}
        <ResourcesSection />
      </div>
    </div>
  );
}
