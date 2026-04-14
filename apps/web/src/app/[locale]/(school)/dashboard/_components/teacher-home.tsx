'use client';

import { BookOpen, Calendar, CheckSquare, Edit, UserMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { SelfReportAbsenceDialog } from '@/components/self-report-absence-dialog';
import { TodayScheduleWidget, type TodayScheduleItem } from '@/components/today-schedule-widget';
import { apiClient } from '@/lib/api-client';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

interface MyTimetableEntry {
  schedule_id: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  room_name: string | null;
}

export function TeacherHome({ schoolName }: { schoolName: string }) {
  const t = useTranslations('dashboard.todaySchedule');
  const tActions = useTranslations('dashboard.teacherActions');
  const [todayItems, setTodayItems] = React.useState<TodayScheduleItem[]>([]);
  const [timetableLoading, setTimetableLoading] = React.useState(true);
  const [absenceDialogOpen, setAbsenceDialogOpen] = React.useState(false);

  React.useEffect(() => {
    const today = new Date();
    const weekDateIso = today.toISOString().slice(0, 10);
    const todayWeekday = today.getDay();

    apiClient<{ data: MyTimetableEntry[] }>(
      `/api/v1/scheduling/timetable/my?week_date=${weekDateIso}`,
      { silent: true },
    )
      .then((res) => {
        const items = (res.data ?? [])
          .filter((e) => e.weekday === todayWeekday)
          .map<TodayScheduleItem>((e) => ({
            id: e.schedule_id,
            start_time: e.start_time,
            end_time: e.end_time,
            primary: e.subject_name ?? e.class_name,
            secondary: e.class_name !== (e.subject_name ?? e.class_name) ? e.class_name : null,
            tertiary: e.room_name,
          }));
        setTodayItems(items);
      })
      .catch((err) => {
        console.error('[TeacherHome.timetable]', err);
        setTodayItems([]);
      })
      .finally(() => setTimetableLoading(false));
  }, []);

  const teacherStats = [
    { label: 'My Classes', value: '6', icon: BookOpen, color: 'blue' as const, href: '/classes' },
    {
      label: 'Pending Grades',
      value: '14',
      icon: Edit,
      color: 'amber' as const,
      href: '/gradebook',
    },
    {
      label: "Today's Classes",
      value: String(todayItems.length),
      icon: Calendar,
      color: 'emerald' as const,
      href: '/scheduling/my-timetable',
    },
  ];

  const teacherActions = [
    { icon: CheckSquare, label: tActions('takeAttendance'), href: '/attendance/take' },
    { icon: Edit, label: tActions('enterGrades'), href: '/gradebook' },
    { icon: Calendar, label: tActions('viewSchedule'), href: '/scheduling/my-timetable' },
    {
      icon: UserMinus,
      label: tActions('reportAbsence'),
      onClick: () => setAbsenceDialogOpen(true),
    },
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
      iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />

        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={teacherActions} />
          <SchoolSnapshot variant="compact" customStats={teacherStats} />
        </div>

        <TodayScheduleWidget
          title={t('title')}
          items={todayItems}
          loading={timetableLoading}
          viewAllHref="/scheduling/my-timetable"
          viewAllLabel={t('viewAll')}
          emptyLabel={t('empty')}
        />

        <PriorityFeed customItems={teacherPriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        <SchoolSnapshot variant="default" customStats={teacherStats} />
        <QuickActions variant="grid" customActions={teacherActions} />
      </div>

      <SelfReportAbsenceDialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen} />
    </div>
  );
}
