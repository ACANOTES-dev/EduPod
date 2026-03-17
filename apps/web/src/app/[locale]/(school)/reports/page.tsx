'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  GraduationCap,
  Bell,
  FileText,
  ClipboardCheck,
  Heart,
  Calculator,
  Download,
  type LucideIcon,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportCard {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  href: string;
  color: string;
}

interface ReportGroup {
  labelKey: string;
  cards: ReportCard[];
}

// ─── Report Groups ────────────────────────────────────────────────────────────

const reportGroups: ReportGroup[] = [
  {
    labelKey: 'reports.groupAcademic',
    cards: [
      {
        icon: TrendingUp,
        titleKey: 'reports.promotionRollover',
        descriptionKey: 'reports.promotionRolloverDesc',
        href: '/reports/promotion-rollover',
        color: 'text-emerald-600',
      },
      {
        icon: BarChart3,
        titleKey: 'reports.workload',
        descriptionKey: 'reports.workloadDesc',
        href: '/reports/workload',
        color: 'text-indigo-600',
      },
    ],
  },
  {
    labelKey: 'reports.groupFinance',
    cards: [
      {
        icon: Calculator,
        titleKey: 'reports.feeGeneration',
        descriptionKey: 'reports.feeGenerationDesc',
        href: '/reports/fee-generation',
        color: 'text-blue-600',
      },
      {
        icon: DollarSign,
        titleKey: 'reports.writeOffs',
        descriptionKey: 'reports.writeOffsDesc',
        href: '/reports/write-offs',
        color: 'text-amber-600',
      },
      {
        icon: FileText,
        titleKey: 'reports.householdStatement',
        descriptionKey: 'reports.householdStatementDesc',
        href: '/finance/statements',
        color: 'text-sky-600',
      },
    ],
  },
  {
    labelKey: 'reports.groupOperations',
    cards: [
      {
        icon: GraduationCap,
        titleKey: 'reports.admissionsFunnel',
        descriptionKey: 'reports.admissionsFunnelDesc',
        href: '/admissions/analytics',
        color: 'text-pink-600',
      },
      {
        icon: ClipboardCheck,
        titleKey: 'reports.attendanceExceptions',
        descriptionKey: 'reports.attendanceExceptionsDesc',
        href: '/attendance/exceptions',
        color: 'text-orange-600',
      },
      {
        icon: Bell,
        titleKey: 'reports.notificationDelivery',
        descriptionKey: 'reports.notificationDeliveryDesc',
        href: '/reports/notification-delivery',
        color: 'text-purple-600',
      },
      {
        icon: Heart,
        titleKey: 'reports.allergyReport',
        descriptionKey: 'reports.allergyReportDesc',
        href: '/students/allergy-report',
        color: 'text-red-600',
      },
    ],
  },
  {
    labelKey: 'reports.groupPayroll',
    cards: [
      {
        icon: Users,
        titleKey: 'reports.payrollReports',
        descriptionKey: 'reports.payrollReportsDesc',
        href: '/payroll/reports',
        color: 'text-violet-600',
      },
    ],
  },
  {
    labelKey: 'reports.groupData',
    cards: [
      {
        icon: Download,
        titleKey: 'reports.studentExport',
        descriptionKey: 'reports.studentExportDesc',
        href: '/reports/student-export',
        color: 'text-teal-600',
      },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsHubPage() {
  const t = useTranslations();

  return (
    <div className="space-y-8">
      <PageHeader title={t('reports.title')} description={t('reports.hubDescription')} />

      {reportGroups.map((group) => (
        <section key={group.labelKey}>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">
            {t(group.labelKey)}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary ${card.color}`}
                >
                  <card.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary group-hover:text-primary-700">
                    {t(card.titleKey)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {t(card.descriptionKey)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
