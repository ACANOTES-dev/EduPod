'use client';

import { Users, GraduationCap, ClipboardCheck, Send, UserCheck, MessageSquare } from 'lucide-react';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

export function FrontOfficeHome({ schoolName }: { schoolName: string }) {
  const officeStats = [
    {
      label: 'Active Students',
      value: '584',
      icon: GraduationCap,
      color: 'emerald',
      href: '/students',
    },
    {
      label: 'Pending Apps',
      value: '12',
      icon: ClipboardCheck,
      color: 'amber',
      href: '/admissions',
    },
    {
      label: "Today's Attendance",
      value: '96%',
      icon: UserCheck,
      color: 'blue',
      href: '/attendance',
    },
  ];

  const officeActions = [
    { icon: Users, label: 'Register Family', href: '/admissions' },
    { icon: ClipboardCheck, label: 'Check Attendance', href: '/attendance' },
    { icon: Send, label: 'New Communication', href: '/inbox?compose=1' },
    { icon: MessageSquare, label: 'Open Inquiries', href: '/admissions' },
  ];

  const officePriority = [
    {
      id: 1,
      title: 'Pending Admissions',
      description: '3 new applications require review',
      actionLabel: 'Review',
      href: '/admissions',
      icon: Users,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />

        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={officeActions} />
          <SchoolSnapshot variant="compact" customStats={officeStats} title="Operations" />
        </div>

        <PriorityFeed customItems={officePriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" customStats={officeStats} title="Operations" />
        <QuickActions variant="grid" customActions={officeActions} />
      </div>
    </div>
  );
}
