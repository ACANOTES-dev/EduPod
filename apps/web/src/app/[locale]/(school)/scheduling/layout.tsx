'use client';

import {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Clock,
  DoorClosed,
  Heart,
  History,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

const tabs = [
  { key: 'dashboard', href: '/scheduling/dashboard', icon: BarChart3, tKey: 'auto.dashboard' },
  { key: 'periodGrid', href: '/scheduling/period-grid', icon: Calendar, tKey: 'auto.periodGrid' },
  { key: 'curriculum', href: '/scheduling/curriculum', icon: BookOpen, tKey: 'v2.curriculum' },
  { key: 'competencies', href: '/scheduling/competencies', icon: Users, tKey: 'v2.competencies' },
  { key: 'breakGroups', href: '/scheduling/break-groups', icon: Clock, tKey: 'v2.breakGroups' },
  { key: 'teacherConfig', href: '/scheduling/teacher-config', icon: UserCog, tKey: 'v2.teacherConfig' },
  { key: 'roomClosures', href: '/scheduling/room-closures', icon: DoorClosed, tKey: 'v2.roomClosures' },
  { key: 'availability', href: '/scheduling/availability', icon: Clock, tKey: 'auto.availability' },
  { key: 'preferences', href: '/scheduling/preferences', icon: Heart, tKey: 'auto.preferences' },
  { key: 'requirements', href: '/scheduling/requirements', icon: ClipboardList, tKey: 'auto.requirements' },
  { key: 'autoScheduler', href: '/scheduling/auto', icon: Sparkles, tKey: 'auto.autoScheduler' },
  { key: 'runs', href: '/scheduling/runs', icon: History, tKey: 'runs.title' },
];

export default function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('scheduling');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive = (pathname ?? '').startsWith(fullHref);
          return (
            <Link
              key={tab.key}
              href={fullHref}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {t(tab.tKey)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
