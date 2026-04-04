'use client';

import { BarChart3, ClipboardCheck, FileText, Stethoscope, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';


import { PageHeader } from '@/components/page-header';

import { NcseReturnTab } from './_components/ncse-return-tab';
import { OverviewTab } from './_components/overview-tab';
import { PlanComplianceTab } from './_components/plan-compliance-tab';
import { ProfessionalInvolvementTab } from './_components/professional-involvement-tab';
import { ResourceUtilisationTab } from './_components/resource-utilisation-tab';


// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  'ncseReturn',
  'overview',
  'resourceUtilisation',
  'planCompliance',
  'professionalInvolvement',
] as const;

type ReportTab = (typeof TABS)[number];

const TAB_ICONS: Record<ReportTab, React.ElementType> = {
  ncseReturn: FileText,
  overview: BarChart3,
  resourceUtilisation: Users,
  planCompliance: ClipboardCheck,
  professionalInvolvement: Stethoscope,
};

const TAB_CONTENT: Record<ReportTab, React.FC> = {
  ncseReturn: NcseReturnTab,
  overview: OverviewTab,
  resourceUtilisation: ResourceUtilisationTab,
  planCompliance: PlanComplianceTab,
  professionalInvolvement: ProfessionalInvolvementTab,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SenReportsPage() {
  const t = useTranslations('sen');
  const [activeTab, setActiveTab] = React.useState<ReportTab>('overview');

  const ActiveContent = TAB_CONTENT[activeTab];

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports.title')} description={t('reports.description')} />

      {/* Tab navigation */}
      <div className="overflow-x-auto border-b border-border">
        <nav className="-mb-px flex gap-1" aria-label={t('reportTabs')}>
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:border-border hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{t(`reports.tabs.${tab}`)}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active tab content */}
      <ActiveContent />
    </div>
  );
}
