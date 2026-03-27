'use client';

import {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Clock,
  DoorClosed,
  FileBarChart2,
  FlaskConical,
  GitBranch,
  Heart,
  History,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  UserCog,
  UserX,
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
  { key: 'dashboard', href: '/scheduling/dashboard', icon: BarChart3, tKey: 'auto.dashboard' },
  { key: 'periodGrid', href: '/scheduling/period-grid', icon: Calendar, tKey: 'auto.periodGrid' },
  { key: 'curriculum', href: '/scheduling/curriculum', icon: BookOpen, tKey: 'v2.curriculum' },
  { key: 'competencies', href: '/scheduling/competencies', icon: Users, tKey: 'v2.competencies' },
  { key: 'coverage', href: '/scheduling/competency-coverage', icon: ShieldCheck, tKey: 'v2.coverageNav' },
  { key: 'breakGroups', href: '/scheduling/break-groups', icon: Clock, tKey: 'v2.breakGroups' },
  { key: 'teacherConfig', href: '/scheduling/teacher-config', icon: UserCog, tKey: 'v2.teacherConfig' },
  { key: 'roomClosures', href: '/scheduling/room-closures', icon: DoorClosed, tKey: 'v2.roomClosures' },
  { key: 'availability', href: '/scheduling/availability', icon: Clock, tKey: 'auto.availability' },
  { key: 'preferences', href: '/scheduling/preferences', icon: Heart, tKey: 'auto.preferences' },
  { key: 'requirements', href: '/scheduling/requirements', icon: ClipboardList, tKey: 'auto.requirements' },
  { key: 'autoScheduler', href: '/scheduling/auto', icon: Sparkles, tKey: 'auto.autoScheduler' },
  { key: 'runs', href: '/scheduling/runs', icon: History, tKey: 'runs.title' },
  { key: 'substitutions', href: '/scheduling/substitutions', icon: UserX, tKey: 'substitutions.navTitle' },
  { key: 'substitutionBoard', href: '/scheduling/substitution-board', icon: MonitorPlay, tKey: 'board.navTitle' },
  { key: 'myTimetable', href: '/scheduling/my-timetable', icon: Calendar, tKey: 'myTimetable.navTitle' },
  { key: 'exams', href: '/scheduling/exams', icon: FlaskConical, tKey: 'exams.navTitle' },
  { key: 'scenarios', href: '/scheduling/scenarios', icon: GitBranch, tKey: 'scenarios.navTitle' },
  { key: 'coverReports', href: '/scheduling/cover-reports', icon: FileBarChart2, tKey: 'coverReports.navTitle' },
];

export default function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('scheduling');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const renderNavLink = (tab: NavTab) => {
    const fullHref = `/${locale}${tab.href}`;
    const isActive =
      tab.key === 'dashboard'
        ? (pathname ?? '') === fullHref || (pathname ?? '').endsWith('/scheduling/dashboard')
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
        {t(tab.tKey)}
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
