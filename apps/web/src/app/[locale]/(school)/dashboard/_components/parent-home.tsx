'use client';

import { CreditCard, DollarSign, FileText, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TodayScheduleWidget, type TodayScheduleItem } from '@/components/today-schedule-widget';
import { apiClient } from '@/lib/api-client';

import { GreetingRow } from './greeting-row';
import { PriorityFeed } from './priority-feed';
import { QuickActions } from './quick-actions';
import { SchoolSnapshot } from './school-snapshot';

interface LinkedStudent {
  student_id: string;
  first_name: string;
  last_name: string;
  year_group_name: string | null;
}

interface ParentInvoiceSummary {
  id: string;
  invoice_number: string;
  balance_amount: number | string;
  status: string;
  due_date: string;
  currency_code: string;
}

interface ParentFinanceResponse {
  total_outstanding_balance: number;
  invoices: ParentInvoiceSummary[];
}

interface TimetableCell {
  weekday: number;
  period_order: number;
  subject_name: string;
  teacher_name: string | null;
  room_name: string | null;
}

interface ParentTimetableResponse {
  class_name: string;
  weekdays: number[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  cells: TimetableCell[];
}

export function ParentHome({ schoolName }: { schoolName: string }) {
  const t = useTranslations('dashboard');
  const [students, setStudents] = React.useState<LinkedStudent[]>([]);
  const [outstandingBalance, setOutstandingBalance] = React.useState<number>(0);
  const [outstandingInvoice, setOutstandingInvoice] = React.useState<ParentInvoiceSummary | null>(
    null,
  );
  const [currencyCode, setCurrencyCode] = React.useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  const [todayItems, setTodayItems] = React.useState<TodayScheduleItem[]>([]);
  const [timetableLoading, setTimetableLoading] = React.useState(false);

  React.useEffect(() => {
    async function load() {
      try {
        const dash = await apiClient<{ data: { students: LinkedStudent[] } }>(
          '/api/v1/dashboard/parent',
          { silent: true }, // SCHED-036
        );
        const studentList = dash.data.students ?? [];
        setStudents(studentList);
        if (studentList[0]) setSelectedStudentId(studentList[0].student_id);

        const studentIds = studentList.map((s) => s.student_id);
        if (studentIds.length === 0) return;

        const results = await Promise.all(
          studentIds.map((id) =>
            apiClient<{ data: ParentFinanceResponse } | ParentFinanceResponse>(
              `/api/v1/parent/students/${id}/finances`,
              { silent: true }, // SCHED-036
            ).catch((err) => {
              console.error('[ParentHome]', err);
              return null;
            }),
          ),
        );

        let total = 0;
        const unpaid: ParentInvoiceSummary[] = [];
        const seenInvoiceIds = new Set<string>();
        let currency = '';

        for (const r of results) {
          if (!r) continue;
          const payload: ParentFinanceResponse =
            'data' in r
              ? (r as { data: ParentFinanceResponse }).data
              : (r as ParentFinanceResponse);
          total += Number(payload.total_outstanding_balance ?? 0);
          for (const inv of payload.invoices ?? []) {
            if (seenInvoiceIds.has(inv.id)) continue;
            seenInvoiceIds.add(inv.id);
            currency = currency || inv.currency_code;
            if (['issued', 'partially_paid', 'overdue'].includes(inv.status)) {
              unpaid.push(inv);
            }
          }
        }

        unpaid.sort((a, b) => a.due_date.localeCompare(b.due_date));
        setCurrencyCode(currency);
        setOutstandingBalance(Math.round(total * 100) / 100);
        setOutstandingInvoice(unpaid[0] ?? null);
      } catch (err) {
        console.error('[ParentHome]', err);
      }
    }
    void load();
  }, []);

  React.useEffect(() => {
    if (!selectedStudentId) return;

    setTimetableLoading(true);
    const todayWeekday = new Date().getDay();

    apiClient<ParentTimetableResponse | { data: ParentTimetableResponse }>(
      `/api/v1/parent/timetable?student_id=${selectedStudentId}`,
      { silent: true },
    )
      .then((res) => {
        const payload = 'data' in res ? (res as { data: ParentTimetableResponse }).data : res;
        const periodMap = new Map<number, { start: string; end: string; name: string }>();
        for (const p of payload.periods ?? []) {
          periodMap.set(p.order, { start: p.start_time, end: p.end_time, name: p.name });
        }
        const items = (payload.cells ?? [])
          .filter((c) => c.weekday === todayWeekday)
          .map<TodayScheduleItem>((c) => {
            const period = periodMap.get(c.period_order);
            return {
              id: `${c.weekday}-${c.period_order}`,
              start_time: period?.start ?? '00:00',
              end_time: period?.end ?? '00:00',
              primary: c.subject_name,
              secondary: c.teacher_name,
              tertiary: c.room_name,
            };
          });
        setTodayItems(items);
      })
      .catch((err) => {
        console.error('[ParentHome.timetable]', err);
        setTodayItems([]);
      })
      .finally(() => setTimetableLoading(false));
  }, [selectedStudentId]);

  const selectedStudent = students.find((s) => s.student_id === selectedStudentId);

  const parentStats = [
    ...students.slice(0, 1).map((s) => ({
      label: `${s.first_name} ${s.last_name}`,
      value: s.year_group_name ?? '',
      icon: '/avatar.jpg',
      color: 'emerald' as const,
      href: `/students/${s.student_id}`,
    })),
    ...(outstandingBalance > 0
      ? [
          {
            label: t('parentDashboard.outstandingBalance'),
            value: `${currencyCode ? `${currencyCode} ` : ''}${outstandingBalance.toFixed(2)}`,
            icon: DollarSign,
            color: 'red' as const,
            href: '/finance/invoices',
          },
        ]
      : []),
  ];

  const parentActions = [
    {
      icon: CreditCard,
      label: t('parentDashboard.quickActions.payInvoice'),
      href: '/dashboard/parent',
    },
    {
      icon: FileText,
      label: t('parentDashboard.quickActions.viewGrades'),
      href: '/dashboard/parent?tab=grades',
    },
    {
      icon: Phone,
      label: t('parentDashboard.quickActions.contactSchool'),
      href: '/inbox?compose=1',
    },
  ];

  const parentPriority = outstandingInvoice
    ? [
        {
          id: outstandingInvoice.id,
          title: outstandingInvoice.invoice_number,
          description: `${outstandingInvoice.currency_code} ${Number(
            outstandingInvoice.balance_amount,
          ).toFixed(2)}`,
          actionLabel: t('parentDashboard.quickActions.payInvoice'),
          href: '/dashboard/parent',
          icon: CreditCard,
          iconColor: 'text-red-600 dark:text-red-400',
          iconBg: 'bg-red-100 dark:bg-red-500/20',
        },
      ]
    : [];

  const widgetTitle = selectedStudent
    ? `${selectedStudent.first_name}'s ${t('todaySchedule.title')}`
    : t('todaySchedule.title');

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <GreetingRow schoolName={schoolName} />

        <div className="lg:hidden space-y-6">
          <QuickActions variant="horizontal" customActions={parentActions} />
          {parentStats.length > 0 && (
            <SchoolSnapshot
              variant="compact"
              customStats={parentStats}
              title={t('parentDashboard.linkedStudents')}
            />
          )}
        </div>

        {students.length > 0 && (
          <>
            {students.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {students.map((s) => (
                  <button
                    key={s.student_id}
                    type="button"
                    onClick={() => setSelectedStudentId(s.student_id)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      selectedStudentId === s.student_id
                        ? 'bg-primary text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-surface'
                    }`}
                  >
                    {s.first_name}
                  </button>
                ))}
              </div>
            )}
            <TodayScheduleWidget
              title={widgetTitle}
              items={todayItems}
              loading={timetableLoading}
              viewAllHref="/dashboard/parent?tab=timetable"
            />
          </>
        )}

        <PriorityFeed customItems={parentPriority} />
      </div>

      <div className="hidden lg:block w-[360px] shrink-0 space-y-6 lg:pt-[56px] xl:pt-0">
        {parentStats.length > 0 && (
          <SchoolSnapshot
            variant="default"
            customStats={parentStats}
            title={t('parentDashboard.linkedStudents')}
          />
        )}
        <QuickActions variant="grid" customActions={parentActions} />
      </div>
    </div>
  );
}
