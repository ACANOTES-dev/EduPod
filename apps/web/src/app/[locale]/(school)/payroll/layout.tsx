'use client';

import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  DollarSign,
  Download,
  FileText,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

interface NavTab {
  key: string;
  href: string;
  icon: LucideIcon;
  tKey: string;
}

const tabs: NavTab[] = [
  { key: 'dashboard', href: '/payroll', icon: LayoutDashboard, tKey: 'dashboard' },
  { key: 'runs', href: '/payroll/runs', icon: CalendarDays, tKey: 'payrollRuns' },
  { key: 'compensation', href: '/payroll/compensation', icon: DollarSign, tKey: 'compensation' },
  { key: 'staffAttendance', href: '/payroll/staff-attendance', icon: CalendarCheck, tKey: 'staffAttendance' },
  { key: 'classDelivery', href: '/payroll/class-delivery', icon: BookOpen, tKey: 'classDelivery' },
  { key: 'exports', href: '/payroll/exports', icon: Download, tKey: 'exports' },
  { key: 'myPayslips', href: '/payroll/my-payslips', icon: FileText, tKey: 'myPayslips' },
  { key: 'reports', href: '/payroll/reports', icon: BarChart3, tKey: 'reports' },
  { key: 'staff', href: '/payroll/staff', icon: Users, tKey: 'staffName' },
  { key: 'documents', href: '/payroll/documents', icon: ClipboardList, tKey: 'payslip' },
];

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('payroll');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const renderNavLink = (tab: NavTab) => {
    const fullHref = `/${locale}${tab.href}`;
    const isActive =
      tab.key === 'dashboard'
        ? (pathname ?? '') === fullHref || (pathname ?? '').endsWith('/payroll')
        : (pathname ?? '').startsWith(fullHref);
    return (
      <Link
        key={tab.key}
        href={fullHref}
        className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
        }`}
      >
        <tab.icon className="h-4 w-4 shrink-0" />
        {t(tab.tKey as Parameters<typeof t>[0])}
      </Link>
    );
  };

  return (
    <div>
      {/* Horizontal scrollable nav on mobile */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px md:hidden">
        {tabs.map(renderNavLink)}
      </nav>

      <div className="flex gap-6">
        {/* Vertical sub-navigation sidebar — desktop only */}
        <nav className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-4 space-y-0.5">
            {tabs.map(renderNavLink)}
          </div>
        </nav>

        {/* Main content */}
        <div className="min-w-0 flex-1 pt-4 md:pt-0">
          {children}
        </div>
      </div>
    </div>
  );
}
