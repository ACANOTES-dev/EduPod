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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';

// ─── Mock data ────────────────────────────────────────────────────────────────

const NATIONALITY_DATA = [
  { name: 'Libyan', value: 102, fill: '#6366f1' },
  { name: 'Egyptian', value: 34, fill: '#10b981' },
  { name: 'Sudanese', value: 18, fill: '#f59e0b' },
  { name: 'Tunisian', value: 12, fill: '#8b5cf6' },
  { name: 'British', value: 8, fill: '#06b6d4' },
  { name: 'Other', value: 21, fill: '#94a3b8' },
];

const GENDER_BY_YEAR = [
  { year: 'Year 7', male: 18, female: 15 },
  { year: 'Year 8', male: 20, female: 17 },
  { year: 'Year 9', male: 16, female: 19 },
  { year: 'Year 10', male: 22, female: 18 },
  { year: 'Year 12', male: 14, female: 16 },
];

const AGE_DIST = [
  { age: '11', count: 12 },
  { age: '12', count: 18 },
  { age: '13', count: 22 },
  { age: '14', count: 25 },
  { age: '15', count: 28 },
  { age: '16', count: 24 },
  { age: '17', count: 20 },
  { age: '18', count: 16 },
];

const YEAR_GROUP_SIZES = [
  { year: 'Year 7', size: 33, capacity: 40 },
  { year: 'Year 8', size: 37, capacity: 40 },
  { year: 'Year 9', size: 35, capacity: 40 },
  { year: 'Year 10', size: 40, capacity: 40 },
  { year: 'Year 12', size: 30, capacity: 36 },
];

const ENROLMENT_TREND = [
  { month: 'Oct', new_enrolments: 4, withdrawals: 1 },
  { month: 'Nov', new_enrolments: 2, withdrawals: 0 },
  { month: 'Dec', new_enrolments: 1, withdrawals: 2 },
  { month: 'Jan', new_enrolments: 8, withdrawals: 0 },
  { month: 'Feb', new_enrolments: 5, withdrawals: 1 },
  { month: 'Mar', new_enrolments: 3, withdrawals: 1 },
];

const STATUS_DATA = [
  { name: 'Active', value: 195, fill: '#10b981' },
  { name: 'Applicant', value: 14, fill: '#6366f1' },
  { name: 'Withdrawn', value: 8, fill: '#ef4444' },
  { name: 'Graduated', value: 22, fill: '#94a3b8' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemographicsPage() {
  const t = useTranslations('reports');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(t('demographics.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t('demographics.title')} description={t('demographics.description')} />

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

      {/* Grid: Nationality + Gender */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Nationality Pie */}
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {t('demographics.nationalityTitle')}
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={NATIONALITY_DATA}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                >
                  {NATIONALITY_DATA.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className="shrink-0 space-y-1.5">
              {NATIONALITY_DATA.map((d) => (
                <li key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: d.fill }}
                  />
                  <span className="text-text-secondary">{d.name}</span>
                  <span className="ms-auto font-medium text-text-primary">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Gender by Year Group */}
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {t('demographics.genderTitle')}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={GENDER_BY_YEAR} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="male"
                name={t('demographics.male')}
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="female"
                name={t('demographics.female')}
                fill="#ec4899"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Age Distribution */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('demographics.ageTitle')}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={AGE_DIST} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="age"
              className="text-xs"
              label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }}
            />
            <YAxis className="text-xs" />
            <Tooltip />
            <Bar
              dataKey="count"
              name={t('grades.studentCount')}
              fill="#10b981"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Year Group Sizes */}
      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">
            {t('demographics.yearGroupSizesTitle')}
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('yearGroup')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('demographics.enrolled')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('demographics.capacity')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('demographics.fill')}
              </th>
            </tr>
          </thead>
          <tbody>
            {YEAR_GROUP_SIZES.map((row) => {
              const pct = Math.round((row.size / row.capacity) * 100);
              return (
                <tr
                  key={row.year}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.year}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.size}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.capacity}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-secondary">
                        <div
                          className={`h-2 rounded-full ${pct >= 95 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-text-secondary">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Enrolment Trend */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('demographics.enrolmentTrendTitle')}
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ENROLMENT_TREND} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="new_enrolments"
              name={t('demographics.newEnrolments')}
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="withdrawals"
              name={t('demographics.withdrawals')}
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Status Distribution donut */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('demographics.statusTitle')}
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={STATUS_DATA}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {STATUS_DATA.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <ul className="shrink-0 space-y-2">
            {STATUS_DATA.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: d.fill }}
                />
                <span className="text-text-secondary">{d.name}</span>
                <span className="ms-auto font-semibold text-text-primary">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
