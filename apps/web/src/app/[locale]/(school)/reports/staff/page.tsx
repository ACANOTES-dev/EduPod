'use client';

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

import { Button, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';

// ─── Mock data ────────────────────────────────────────────────────────────────

const HEADCOUNT_BY_DEPT = [
  { dept: 'Sciences', count: 9 },
  { dept: 'Humanities', count: 8 },
  { dept: 'Languages', count: 7 },
  { dept: 'Maths', count: 6 },
  { dept: 'Arts', count: 4 },
  { dept: 'Admin', count: 11 },
];

const RATIO_TREND = [
  { month: 'Oct', ratio: 4.1 },
  { month: 'Nov', ratio: 4.2 },
  { month: 'Dec', ratio: 4.3 },
  { month: 'Jan', ratio: 4.2 },
  { month: 'Feb', ratio: 4.3 },
  { month: 'Mar', ratio: 4.4 },
];

const TENURE_DIST = [
  { range: '<1 yr', count: 5 },
  { range: '1–2 yr', count: 8 },
  { range: '2–5 yr', count: 14 },
  { range: '5–10 yr', count: 12 },
  { range: '>10 yr', count: 6 },
];

const QUALIFICATION_DATA = [
  { subject: 'Math', qualified: true, teachers: 3, req: 3 },
  { subject: 'Science', qualified: true, teachers: 4, req: 3 },
  { subject: 'English', qualified: true, teachers: 3, req: 3 },
  { subject: 'Arabic', qualified: true, teachers: 2, req: 2 },
  { subject: 'Physics', qualified: false, teachers: 1, req: 2 },
  { subject: 'History', qualified: false, teachers: 1, req: 2 },
];

const COMPENSATION_BANDS = [
  { band: '<1,500', count: 6 },
  { band: '1,500–2,000', count: 12 },
  { band: '2,000–3,000', count: 16 },
  { band: '3,000–4,000', count: 8 },
  { band: '>4,000', count: 3 },
];

type Tab = 'headcount' | 'ratio' | 'tenure' | 'attendance' | 'qualifications' | 'compensation';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffAnalyticsPage() {
  const t = useTranslations('reports');
  const [activeTab, setActiveTab] = React.useState<Tab>('headcount');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'headcount', label: t('staff.tabHeadcount') },
    { key: 'ratio', label: t('staff.tabRatio') },
    { key: 'tenure', label: t('staff.tabTenure') },
    { key: 'attendance', label: t('staff.tabAttendance') },
    { key: 'qualifications', label: t('staff.tabQualifications') },
    { key: 'compensation', label: t('staff.tabCompensation') },
  ];

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(t('staff.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('staff.title')} description={t('staff.description')} />

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* AI Summary */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleAiSummarise()}
          disabled={aiLoading}
        >
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

      {/* Headcount by Dept */}
      {activeTab === 'headcount' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('staff.headcountTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={HEADCOUNT_BY_DEPT} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="dept" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="count" name={t('staff.staffCount')} radius={[4, 4, 0, 0]}>
                {HEADCOUNT_BY_DEPT.map((_, i) => (
                  <Cell
                    key={i}
                    fill={['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'][i % 6]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Staff-to-Student Ratio */}
      {activeTab === 'ratio' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t('staff.currentRatio')} value="1:4.4" />
            <StatCard label={t('staff.totalStudents')} value="195" />
            <StatCard label={t('staff.totalTeachingStaff')} value="34" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('staff.ratioTrendTitle')}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={RATIO_TREND} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis domain={[3, 6]} className="text-xs" />
                <Tooltip formatter={(v) => [`1:${String(v)}`, t('staff.ratio')]} />
                <Line
                  type="monotone"
                  dataKey="ratio"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tenure Distribution */}
      {activeTab === 'tenure' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('staff.tenureTitle')}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={TENURE_DIST} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="range" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="count"
                name={t('staff.staffCount')}
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Staff Attendance */}
      {activeTab === 'attendance' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <p className="text-sm text-text-secondary">{t('staff.attendanceNote')}</p>
        </div>
      )}

      {/* Qualifications */}
      {activeTab === 'qualifications' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                {['subject', 'requiredTeachers', 'qualifiedTeachers', 'coverage'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    {t(`staff.col.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUALIFICATION_DATA.map((row) => (
                <tr
                  key={row.subject}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.subject}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.req}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.teachers}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.qualified ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                    >
                      {row.qualified ? t('staff.covered') : t('staff.gap')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compensation */}
      {activeTab === 'compensation' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('staff.compensationTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={COMPENSATION_BANDS} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="band" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="count"
                name={t('staff.staffCount')}
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
