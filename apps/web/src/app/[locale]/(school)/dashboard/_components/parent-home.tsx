'use client';

import { CreditCard, FileText, Phone, DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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

export function ParentHome({ schoolName }: { schoolName: string }) {
  const t = useTranslations('dashboard');
  const [students, setStudents] = React.useState<LinkedStudent[]>([]);
  const [outstandingBalance, setOutstandingBalance] = React.useState<number>(0);
  const [outstandingInvoice, setOutstandingInvoice] = React.useState<ParentInvoiceSummary | null>(
    null,
  );
  const [currencyCode, setCurrencyCode] = React.useState<string>('');

  React.useEffect(() => {
    async function load() {
      try {
        const dash = await apiClient<{ data: { students: LinkedStudent[] } }>(
          '/api/v1/dashboard/parent',
        );
        setStudents(dash.data.students ?? []);

        const studentIds = (dash.data.students ?? []).map((s) => s.student_id);
        if (studentIds.length === 0) return;

        const results = await Promise.all(
          studentIds.map((id) =>
            apiClient<{ data: ParentFinanceResponse } | ParentFinanceResponse>(
              `/api/v1/parent/students/${id}/finances`,
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

        // Sort unpaid by earliest due_date so the most urgent invoice surfaces first
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
