'use client';

import {
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from '@school/ui';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

interface DeliverySummary {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
}

interface ChannelBreakdown {
  channel: string;
  sent: number;
  delivered: number;
  failed: number;
}

interface DeliveryReport {
  summary: DeliverySummary;
  channels: ChannelBreakdown[];
}

// ---- Page ----

export default function NotificationDeliveryPage() {
  const t = useTranslations('reports');

  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [report, setReport] = React.useState<DeliveryReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchReport = React.useCallback(() => {
    if (!startDate || !endDate) return;
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (channelFilter !== 'all') {
      params.set('channel', channelFilter);
    }
    setIsLoading(true);
    apiClient<DeliveryReport>(`/api/v1/reports/notification-delivery?${params.toString()}`)
      .then((res) => setReport(res))
      .catch(() => setReport(null))
      .finally(() => setIsLoading(false));
  }, [startDate, endDate, channelFilter]);

  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('notificationDelivery')} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-auto">
          <Label htmlFor="nd-start">{t('startDate')}</Label>
          <Input
            id="nd-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full sm:w-44"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Label htmlFor="nd-end">{t('endDate')}</Label>
          <Input
            id="nd-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full sm:w-44"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Label>{t('channel')}</Label>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="mt-1 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allChannels')}</SelectItem>
              <SelectItem value="email">{t('email')}</SelectItem>
              <SelectItem value="sms">{t('sms')}</SelectItem>
              <SelectItem value="push">{t('push')}</SelectItem>
              <SelectItem value="in_app">{t('inApp')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
        </div>
      ) : !report ? (
        <EmptyState
          icon={Bell}
          title={t('selectDateRange')}
          description={t('selectDateRangeDescription')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t('totalSent')} value={report.summary.total_sent} />
            <StatCard label={t('totalDelivered')} value={report.summary.total_delivered} />
            <StatCard label={t('totalFailed')} value={report.summary.total_failed} />
          </div>

          {report.channels.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('channelBreakdown')}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={report.channels}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="channel" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="delivered" name={t('delivered')} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name={t('failed')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('channel')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('sent')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('delivered')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('failed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.channels.map((ch) => (
                  <tr key={ch.channel} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{ch.channel}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{ch.sent}</td>
                    <td className="px-4 py-3 text-sm text-emerald-600">{ch.delivered}</td>
                    <td className="px-4 py-3 text-sm text-red-600">{ch.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
