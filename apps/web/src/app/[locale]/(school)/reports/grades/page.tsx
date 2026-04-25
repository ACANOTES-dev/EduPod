'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';

// ─── Mock data ────────────────────────────────────────────────────────────────

const PASS_FAIL = [
  { subject: 'Math', pass: 78, fail: 22 },
  { subject: 'Science', pass: 82, fail: 18 },
  { subject: 'English', pass: 88, fail: 12 },
  { subject: 'Arabic', pass: 91, fail: 9 },
  { subject: 'History', pass: 74, fail: 26 },
  { subject: 'Physics', pass: 69, fail: 31 },
];

const DISTRIBUTION = [
  { range: '0–49', count: 8 },
  { range: '50–59', count: 14 },
  { range: '60–69', count: 28 },
  { range: '70–79', count: 45 },
  { range: '80–89', count: 52 },
  { range: '90–100', count: 23 },
];

const TOP_PERFORMERS = [
  { name: 'Layla Mustafa', score: 96, year_group: 'Year 12' },
  { name: 'Ahmed Al-Rashid', score: 94, year_group: 'Year 10' },
  { name: 'Fatima Ali', score: 91, year_group: 'Year 11' },
  { name: 'Sara Mohamed', score: 89, year_group: 'Year 12' },
  { name: 'Adam Yusuf', score: 88, year_group: 'Year 10' },
];

const BOTTOM_PERFORMERS = [
  { name: 'Youssef Nasser', score: 48, year_group: 'Year 8' },
  { name: 'Hana Saleh', score: 52, year_group: 'Year 7' },
  { name: 'Omar Hassan', score: 55, year_group: 'Year 9' },
  { name: 'Reem Aziz', score: 58, year_group: 'Year 8' },
  { name: 'Khalid Ibrahim', score: 61, year_group: 'Year 10' },
];

const GRADE_TRENDS = [
  { term: 'T1 2024', avg: 72 },
  { term: 'T2 2024', avg: 74 },
  { term: 'T3 2024', avg: 73 },
  { term: 'T1 2025', avg: 75 },
  { term: 'T2 2025', avg: 77 },
  { term: 'T3 2025', avg: 75 },
];

const SUBJECT_DIFFICULTY = [
  { subject: 'Physics', avg: 64 },
  { subject: 'Math', avg: 68 },
  { subject: 'Chemistry', avg: 70 },
  { subject: 'History', avg: 74 },
  { subject: 'Science', avg: 79 },
  { subject: 'English', avg: 83 },
  { subject: 'Arabic', avg: 86 },
];

const GPA_DIST = [
  { range: '0.0–1.0', count: 4 },
  { range: '1.0–2.0', count: 12 },
  { range: '2.0–2.5', count: 18 },
  { range: '2.5–3.0', count: 32 },
  { range: '3.0–3.5', count: 45 },
  { range: '3.5–4.0', count: 39 },
];

type Tab = 'pass-fail' | 'distribution' | 'performers' | 'trends' | 'difficulty' | 'gpa';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradeAnalyticsPage() {
  const t = useTranslations('reports');
  const [activeTab, setActiveTab] = React.useState<Tab>('pass-fail');
  const [yearGroup, setYearGroup] = React.useState('all');
  const [subject, setSubject] = React.useState('all');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [predictMode, setPredictMode] = React.useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pass-fail', label: t('grades.tabPassFail') },
    { key: 'distribution', label: t('grades.tabDistribution') },
    { key: 'performers', label: t('grades.tabPerformers') },
    { key: 'trends', label: t('grades.tabTrends') },
    { key: 'difficulty', label: t('grades.tabDifficulty') },
    { key: 'gpa', label: t('grades.tabGPA') },
  ];

  const handleAiSummarise = async () => {
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(t('grades.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  const PREDICT_TRENDS = [
    ...GRADE_TRENDS,
    { term: 'T1 2026 (P)', avg: null, predicted: 77 },
    { term: 'T2 2026 (P)', avg: null, predicted: 79 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('grades.title')} description={t('grades.description')} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-text-primary">{t('yearGroup')}</p>
          <Select value={yearGroup} onValueChange={setYearGroup}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('attendance.allYearGroups')}</SelectItem>
              {['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 12'].map((yg) => (
                <SelectItem key={yg} value={yg}>
                  {yg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-text-primary">{t('grades.subject')}</p>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('grades.allSubjects')}</SelectItem>
              {['Math', 'Science', 'English', 'Arabic', 'History', 'Physics'].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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

      {/* Pass/Fail */}
      {activeTab === 'pass-fail' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={PASS_FAIL} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="subject" className="text-xs" />
                <YAxis domain={[0, 100]} className="text-xs" />
                <Tooltip />
                <Bar dataKey="pass" name={t('grades.pass')} fill="#10b981" stackId="a" />
                <Bar
                  dataKey="fail"
                  name={t('grades.fail')}
                  fill="#ef4444"
                  stackId="a"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {['subject', 'pass', 'fail'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                    >
                      {t(`grades.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PASS_FAIL.map((row) => (
                  <tr
                    key={row.subject}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-600">{row.pass}%</td>
                    <td className="px-4 py-3 text-sm text-red-500">{row.fail}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Distribution histogram */}
      {activeTab === 'distribution' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('grades.distributionTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={DISTRIBUTION} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="range" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="count"
                name={t('grades.studentCount')}
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top/Bottom Performers */}
      {activeTab === 'performers' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="border-b border-border bg-emerald-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-emerald-800">
                {t('grades.topPerformers')}
              </h3>
            </div>
            <table className="w-full">
              <tbody>
                {TOP_PERFORMERS.map((s, i) => (
                  <tr
                    key={s.name}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                  >
                    <td className="px-4 py-3 text-sm text-text-tertiary font-mono">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{s.name}</p>
                      <p className="text-xs text-text-tertiary">{s.year_group}</p>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        {s.score}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="border-b border-border bg-red-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-red-800">{t('grades.bottomPerformers')}</h3>
            </div>
            <table className="w-full">
              <tbody>
                {BOTTOM_PERFORMERS.map((s, i) => (
                  <tr
                    key={s.name}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                  >
                    <td className="px-4 py-3 text-sm text-text-tertiary font-mono">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{s.name}</p>
                      <p className="text-xs text-text-tertiary">{s.year_group}</p>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        {s.score}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trends */}
      {activeTab === 'trends' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('grades.trendsTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={predictMode ? PREDICT_TRENDS : GRADE_TRENDS}
              margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="term" className="text-xs" />
              <YAxis domain={[60, 90]} className="text-xs" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="avg"
                name={t('grades.averageGrade')}
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

      {/* Subject Difficulty */}
      {activeTab === 'difficulty' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  #
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('grades.subject')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('grades.averageScore')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('grades.difficultyBar')}
                </th>
              </tr>
            </thead>
            <tbody>
              {SUBJECT_DIFFICULTY.map((row, i) => (
                <tr
                  key={row.subject}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm text-text-tertiary">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.subject}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.avg >= 80 ? 'bg-emerald-100 text-emerald-700' : row.avg >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}
                    >
                      {row.avg}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-secondary">
                      <div
                        className={`h-2 rounded-full ${row.avg >= 80 ? 'bg-emerald-500' : row.avg >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${row.avg}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GPA Distribution */}
      {activeTab === 'gpa' && (
        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('grades.gpaDistributionTitle')}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={GPA_DIST} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="range" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="count"
                name={t('grades.studentCount')}
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
