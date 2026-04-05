'use client';

import { BookOpen, Edit, Calendar, CheckSquare } from 'lucide-react';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

export function TeacherHome({ schoolName }: { schoolName: string }) {
  const teacherStats = [
    { label: 'My Classes', value: '6', icon: BookOpen, color: 'blue', href: '/classes' },
    { label: 'Pending Grades', value: '14', icon: Edit, color: 'amber', href: '/gradebook' },
    { label: 'Today\'s Classes', value: '4', icon: Calendar, color: 'emerald', href: '/scheduling' },
  ];

  const teacherActions = [
    { icon: CheckSquare, label: 'Take Attendance', href: '/attendance/take' },
    { icon: Edit, label: 'Enter Grades', href: '/gradebook' },
    { icon: Calendar, label: 'View Schedule', href: '/scheduling' },
  ];

  const teacherPriority = [
    {
      id: 1,
      title: 'Pending Attendance',
      description: 'Year 10 Maths attendance not submitted',
      actionLabel: 'Take',
      href: '/attendance/take',
      icon: CheckSquare,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-500/20'
    }
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />
        
        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={teacherActions} />
          <SchoolSnapshot variant="compact" customStats={teacherStats} />
        </div>

        <PriorityFeed customItems={teacherPriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" customStats={teacherStats} />
        <QuickActions variant="grid" customActions={teacherActions} />
      </div>
    </div>
  );
}
