'use client';

import { Button, Input, Label, StatCard } from '@school/ui';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';

// ─── Mock data ────────────────────────────────────────────────────────────────

const FUNNEL_DATA = [
  { stage: 'Applied',      count: 84, color: '#6366f1' },
  { stage: 'Under Review', count: 62, color: '#8b5cf6' },
  { stage: 'Assessed',     count: 45, color: '#a78bfa' },
  { stage: 'Accepted',     count: 32, color: '#10b981' },
  { stage: 'Enrolled',     count: 24, color: '#059669' },
];

const PROCESSING_TREND = [
  { month: 'Oct', days: 14 }, { month: 'Nov', days: 11 }, { month: 'Dec', days: 18 },
  { month: 'Jan', days: 9  }, { month: 'Feb', days: 8  }, { month: 'Mar', days: 7  },
];

const REJECTION_REASONS = [
  { reason: 'Capacity Full',        count: 18 },
  { reason: 'Academic Level',       count: 12 },
  { reason: 'Documents Incomplete', count: 8  },
  { reason: 'Age Criteria',         count: 6  },
  { reason: 'Other',                count: 4  },
];

const MONTHLY_APPS = [
  { month: 'Sep', apps: 8  }, { month: 'Oct', apps: 14 }, { month: 'Nov', apps: 11 },
  { month: 'Dec', apps: 5  }, { month: 'Jan', apps: 18 }, { month: 'Feb', apps: 16 },
  { month: 'Mar', apps: 12 },
];

const YEAR_DEMAND = [
  { year: 'Year 7',  apps: 24 }, { year: 'Year 8', apps: 18 }, { year: 'Year 9', apps: 14 },
  { year: 'Year 10', apps: 11 }, { year: 'Year 12', apps: 17 },
];

// ─── Funnel visualisation ─────────────────────────────────────────────────────

function FunnelViz({ data }: { data: typeof FUNNEL_DATA }) {
  const max = data[0]?.count ?? 1;
  return (
    <div className="space-y-2">
      {data.map((stage, i) => {
        const width = (stage.count / max) * 100;
        const prev = data[i - 1];
        const conversion = prev ? Math.round((stage.count / prev.count) * 100) : 100;
        return (
          <div key={stage.stage} className="space-y-1">
            {i > 0 && (
              <div className="flex justify-center text-xs text-text-tertiary">
                ↓ {conversion}% conversion
              </div>
            )}
            <div className="relative flex items-center justify-center" style={{ paddingInline: `${(100 - width) / 2}%` }}>
              <div
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-white"
                style={{ backgroundColor: stage.color }}
              >
                <span className="text-sm font-semibold">{stage.stage}</span>
                <span className="text-sm font-bold">{stage.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsAnalyticsPage() {
  const t = useTranslations('reports');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const firstStage = FUNNEL_DATA[0];
  const lastStage = FUNNEL_DATA[FUNNEL_DATA.length - 1];
  const overallConversion = firstStage && lastStage
    ? Math.round((lastStage.count / firstStage.count) * 100)
    : 0;

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(t('admissions.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t('admissions.title')} description={t('admissions.description')} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="adm-start">{t('startDate')}</Label>
          <Input id="adm-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-44" />
        </div>
        <div>
          <Label htmlFor="adm-end">{t('endDate')}</Label>
          <Input id="adm-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-44" />
        </div>
      </div>

      {/* AI summary */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void handleAiSummarise()} disabled={aiLoading}>
          <Sparkles className="me-2 h-4 w-4 text-violet-500" />
          {aiLoading ? t('analytics.generating') : t('analytics.summarise')}
        </Button>
      </div>

      {aiSummary && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm text-violet-900">{aiSummary}</p>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('admissions.totalApplications')} value={firstStage?.count ?? 0} />
        <StatCard label={t('admissions.accepted')} value={FUNNEL_DATA.find((s) => s.stage === 'Accepted')?.count ?? 0} />
        <StatCard label={t('admissions.enrolled')} value={lastStage?.count ?? 0} />
        <StatCard label={t('admissions.overallConversion')} value={`${overallConversion}%`} />
      </div>

      {/* Funnel */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-6 text-base font-semibold text-text-primary">{t('admissions.funnelTitle')}</h2>
        <FunnelViz data={FUNNEL_DATA} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Processing Time Trend */}
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('admissions.processingTimeTitle')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={PROCESSING_TREND} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={(v) => [`${String(v)} days`, t('admissions.avgDays')]} />
              <Line type="monotone" dataKey="days" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Applications */}
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('admissions.monthlyAppsTitle')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MONTHLY_APPS} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="apps" name={t('admissions.applications')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rejection Reasons */}
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('admissions.rejectionReasonsTitle')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={REJECTION_REASONS} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 140 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis dataKey="reason" type="category" className="text-xs" width={140} />
              <Tooltip />
              <Bar dataKey="count" name={t('admissions.count')} fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Year Group Demand */}
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('admissions.yearDemandTitle')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={YEAR_DEMAND} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="apps" name={t('admissions.applications')} radius={[4, 4, 0, 0]}>
                {YEAR_DEMAND.map((entry, i) => <Cell key={entry.year} fill={['#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#059669'][i % 5]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
