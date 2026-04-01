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

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';

// ─── Mock data ────────────────────────────────────────────────────────────────

const CHRONIC_ABSENTEES = [
  { name: 'Youssef Nasser', year_group: 'Year 8', rate: 67 },
  { name: 'Hana Saleh', year_group: 'Year 7', rate: 72 },
  { name: 'Omar Hassan', year_group: 'Year 9', rate: 75 },
  { name: 'Khalid Ibrahim', year_group: 'Year 10', rate: 80 },
  { name: 'Reem Aziz', year_group: 'Year 8', rate: 82 },
];

const HEATMAP_DATA: { day: string; year_group: string; rate: number }[] = [
  ...['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 12'].flatMap((yg, i) =>
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, j) => ({
      day,
      year_group: yg,
      rate: 78 + i * 3 + j * 2 + Math.floor(Math.random() * 6),
    })),
  ),
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const YEAR_GROUPS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 12'];

const COMPLIANCE_DATA = [
  { teacher: 'Ms. Khalil', compliance: 99 },
  { teacher: 'Mr. Hassan', compliance: 95 },
  { teacher: 'Mrs. Nasser', compliance: 88 },
  { teacher: 'Mr. Ibrahim', compliance: 81 },
  { teacher: 'Ms. Salem', compliance: 74 },
];

const TREND_DATA = [
  { week: 'W1', rate: 91 },
  { week: 'W2', rate: 93 },
  { week: 'W3', rate: 89 },
  { week: 'W4', rate: 94 },
  { week: 'W5', rate: 95 },
  { week: 'W6', rate: 93 },
  { week: 'W7', rate: 91 },
  { week: 'W8', rate: 94 },
];

const EXCUSED_DATA = [
  { name: 'Excused', value: 58, fill: '#6366f1' },
  { name: 'Unexcused', value: 42, fill: '#ef4444' },
];

const CLASS_COMPARISON = [
  { class: '10A', rate: 96 },
  { class: '10B', rate: 91 },
  { class: '10C', rate: 88 },
  { class: '9A', rate: 94 },
  { class: '9B', rate: 89 },
  { class: '9C', rate: 85 },
];

// ─── Heatmap cell colour ──────────────────────────────────────────────────────

function heatColor(rate: number): string {
  if (rate >= 95) return 'bg-emerald-500';
  if (rate >= 90) return 'bg-emerald-300';
  if (rate >= 85) return 'bg-amber-300';
  if (rate >= 80) return 'bg-orange-400';
  return 'bg-red-400';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'chronic' | 'heatmap' | 'compliance' | 'trends' | 'excused' | 'comparison';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceAnalyticsPage() {
  const t = useTranslations('reports');
  const [activeTab, setActiveTab] = React.useState<Tab>('chronic');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [yearGroup, setYearGroup] = React.useState('all');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [predictMode, setPredictMode] = React.useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chronic', label: t('attendance.tabChronic') },
    { key: 'heatmap', label: t('attendance.tabHeatmap') },
    { key: 'compliance', label: t('attendance.tabCompliance') },
    { key: 'trends', label: t('attendance.tabTrends') },
    { key: 'excused', label: t('attendance.tabExcused') },
    { key: 'comparison', label: t('attendance.tabComparison') },
  ];

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(t('attendance.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  const PREDICT_TREND = [
    ...TREND_DATA,
    { week: 'W9', rate: 95, predicted: 95 },
    { week: 'W10', rate: null, predicted: 94 },
    { week: 'W11', rate: null, predicted: 93 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('attendance.title')} description={t('attendance.description')} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="att-start">{t('startDate')}</Label>
          <Input
            id="att-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <div>
          <Label htmlFor="att-end">{t('endDate')}</Label>
          <Input
            id="att-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-44"
          />
        </div>
        <div>
          <Label>{t('yearGroup')}</Label>
          <Select value={yearGroup} onValueChange={setYearGroup}>
            <SelectTrigger className="mt-1 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('attendance.allYearGroups')}</SelectItem>
              {YEAR_GROUPS.map((yg) => (
                <SelectItem key={yg} value={yg}>
                  {yg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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

      {/* AI controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleAiSummarise()}
          disabled={aiLoading}
        >
          <Sparkles className="me-2 h-4 w-4 text-violet-500" />
          {aiLoading ? t('analytics.generating') : t('analytics.summarise')}
        </Button>
        {activeTab === 'trends' && (
          <Button size="sm" variant="outline" onClick={() => setPredictMode(!predictMode)}>
            {predictMode ? t('analytics.hidePrediction') : t('analytics.predict')}
          </Button>
        )}
      </div>

      {aiSummary && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm text-violet-900">{aiSummary}</p>
        </div>
      )}

      {/* Tab: Chronic Absenteeism */}
      {activeTab === 'chronic' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  #
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('studentName')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('yearGroup')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('attendance.attendanceRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {CHRONIC_ABSENTEES.map((row, i) => (
                <tr
                  key={row.name}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm text-text-tertiary">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{row.year_group}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {row.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Heatmap */}
      {activeTab === 'heatmap' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('attendance.heatmapTitle')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="pb-2 pe-4 text-start text-text-tertiary" />
                  {DAYS.map((d) => (
                    <th key={d} className="pb-2 px-2 text-center font-medium text-text-tertiary">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {YEAR_GROUPS.map((yg) => (
                  <tr key={yg}>
                    <td className="py-1 pe-4 text-start text-xs font-medium text-text-secondary whitespace-nowrap">
                      {yg}
                    </td>
                    {DAYS.map((day) => {
                      const cell = HEATMAP_DATA.find((r) => r.year_group === yg && r.day === day);
                      const rate = cell?.rate ?? 0;
                      return (
                        <td key={day} className="px-1 py-1">
                          <div
                            className={`flex h-10 w-16 items-center justify-center rounded-lg text-white text-xs font-medium ${heatColor(rate)}`}
                          >
                            {rate}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-emerald-500" /> &ge;95%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-emerald-300" /> 90–94%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-amber-300" /> 85–89%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-orange-400" /> 80–84%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-red-400" /> &lt;80%
            </span>
          </div>
        </div>
      )}

      {/* Tab: Teacher Compliance */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('attendance.complianceChartTitle')}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={COMPLIANCE_DATA}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" domain={[0, 100]} className="text-xs" />
                <YAxis dataKey="teacher" type="category" className="text-xs" width={80} />
                <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.complianceRate')]} />
                <Bar dataKey="compliance" fill="#6366f1" radius={[0, 4, 4, 0]}>
                  {COMPLIANCE_DATA.map((entry) => (
                    <Cell
                      key={entry.teacher}
                      fill={
                        entry.compliance >= 95
                          ? '#10b981'
                          : entry.compliance >= 85
                            ? '#f59e0b'
                            : '#ef4444'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab: Trends */}
      {activeTab === 'trends' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('attendance.trendsTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={predictMode ? PREDICT_TREND : TREND_DATA}
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="week" className="text-xs" />
              <YAxis domain={[80, 100]} className="text-xs" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="rate"
                name={t('attendance.attendanceRate')}
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls={false}
              />
              {predictMode && (
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name={t('analytics.predicted')}
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab: Excused vs Unexcused */}
      {activeTab === 'excused' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('attendance.excusedTitle')}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={EXCUSED_DATA}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                >
                  {EXCUSED_DATA.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('type')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('amount')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {EXCUSED_DATA.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.value}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {Math.round(
                        (row.value / EXCUSED_DATA.reduce((a, b) => a + b.value, 0)) * 100,
                      )}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Class Comparison */}
      {activeTab === 'comparison' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('attendance.comparisonTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={CLASS_COMPARISON} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="class" className="text-xs" />
              <YAxis domain={[80, 100]} className="text-xs" />
              <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.attendanceRate')]} />
              <Bar dataKey="rate" name={t('attendance.attendanceRate')} radius={[4, 4, 0, 0]}>
                {CLASS_COMPARISON.map((entry) => (
                  <Cell
                    key={entry.class}
                    fill={entry.rate >= 93 ? '#10b981' : entry.rate >= 88 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
