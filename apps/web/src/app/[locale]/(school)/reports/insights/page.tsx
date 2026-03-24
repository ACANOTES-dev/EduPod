'use client';

import { Button, EmptyState } from '@school/ui';
import { Brain, Sparkles, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScatterPoint { attendance: number; grade: number; name: string }
interface CostPoint { month: string; cost_per_student: number }
interface HealthRow { year_group: string; score: number; attendance: number; grades: number; collection: number; incidents: number }
interface EffectivenessRow { teacher: string; marking_compliance: number; grade_entry: number; avg_student_grade: number; avg_student_attendance: number }

type Tab = 'attendance-grades' | 'cost-per-student' | 'year-group-health' | 'teacher-effectiveness';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SCATTER: ScatterPoint[] = [
  { attendance: 98, grade: 88, name: 'Ahmed Al-Rashid' },
  { attendance: 85, grade: 72, name: 'Sara Mohamed' },
  { attendance: 72, grade: 61, name: 'Omar Hassan' },
  { attendance: 95, grade: 84, name: 'Fatima Ali' },
  { attendance: 80, grade: 68, name: 'Khalid Ibrahim' },
  { attendance: 91, grade: 79, name: 'Nour Khalil' },
  { attendance: 67, grade: 55, name: 'Youssef Nasser' },
  { attendance: 99, grade: 92, name: 'Layla Mustafa' },
  { attendance: 88, grade: 76, name: 'Adam Yusuf' },
  { attendance: 75, grade: 63, name: 'Hana Saleh' },
];

const MOCK_COST: CostPoint[] = [
  { month: 'Oct', cost_per_student: 420 },
  { month: 'Nov', cost_per_student: 415 },
  { month: 'Dec', cost_per_student: 430 },
  { month: 'Jan', cost_per_student: 418 },
  { month: 'Feb', cost_per_student: 412 },
  { month: 'Mar', cost_per_student: 408 },
];

const MOCK_HEALTH: HealthRow[] = [
  { year_group: 'Year 12', score: 88, attendance: 96, grades: 82, collection: 94, incidents: 1 },
  { year_group: 'Year 10', score: 82, attendance: 93, grades: 79, collection: 88, incidents: 2 },
  { year_group: 'Year 9',  score: 78, attendance: 91, grades: 75, collection: 85, incidents: 3 },
  { year_group: 'Year 8',  score: 71, attendance: 88, grades: 70, collection: 82, incidents: 5 },
  { year_group: 'Year 7',  score: 68, attendance: 86, grades: 68, collection: 78, incidents: 6 },
];

const MOCK_EFFECTIVENESS: EffectivenessRow[] = [
  { teacher: 'Ms. Khalil', marking_compliance: 98, grade_entry: 100, avg_student_grade: 82, avg_student_attendance: 95 },
  { teacher: 'Mr. Hassan', marking_compliance: 94, grade_entry: 97, avg_student_grade: 76, avg_student_attendance: 91 },
  { teacher: 'Mrs. Nasser', marking_compliance: 89, grade_entry: 92, avg_student_grade: 73, avg_student_attendance: 89 },
  { teacher: 'Mr. Ibrahim', marking_compliance: 82, grade_entry: 85, avg_student_grade: 69, avg_student_attendance: 86 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FindingCallout({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Brain className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <p className="text-sm text-blue-900">{text}</p>
    </div>
  );
}

function MetricCell({ value, max = 100 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-sm font-medium text-text-primary">{value}%</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── AI summary button shared utility ─────────────────────────────────────────

function AiSummaryBar({ summary, loading, onRequest, t }: { summary: string | null; loading: boolean; onRequest: () => void; t: (k: string) => string }) {
  if (summary) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <p className="text-sm text-violet-900">{summary}</p>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <Button size="sm" variant="outline" onClick={onRequest} disabled={loading}>
        <Sparkles className="me-2 h-4 w-4" />
        {loading ? t('analytics.generating') : t('analytics.summarise')}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations('reports');
  const [activeTab, setActiveTab] = React.useState<Tab>('attendance-grades');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'attendance-grades', label: t('insights.tabAttendanceGrades') },
    { key: 'cost-per-student', label: t('insights.tabCostPerStudent') },
    { key: 'year-group-health', label: t('insights.tabYearGroupHealth') },
    { key: 'teacher-effectiveness', label: t('insights.tabTeacherEffectiveness') },
  ];

  const handleAiSummarise = async () => {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const res = await apiClient<{ summary: string }>('/api/v1/reports/analytics/ai-summary', {
        method: 'POST',
        body: JSON.stringify({ section: `insights_${activeTab}` }),
      });
      setAiSummary(res.summary);
    } catch {
      setAiSummary(t('analytics.aiSummaryFallback'));
    } finally {
      setAiLoading(false);
    }
  };

  React.useEffect(() => {
    setAiSummary(null);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('insights.title')} description={t('insights.description')} />

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-0">
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
      <AiSummaryBar
        summary={aiSummary}
        loading={aiLoading}
        onRequest={() => void handleAiSummarise()}
        t={t as (k: string) => string}
      />

      {/* Tab: Attendance vs Grades */}
      {activeTab === 'attendance-grades' && (
        <div className="space-y-6">
          <FindingCallout text={t('insights.findingAttendanceGrades')} />
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('insights.scatterTitle')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="attendance" name="Attendance %" unit="%" type="number" domain={[60, 100]} className="text-xs" label={{ value: 'Attendance %', position: 'insideBottom', offset: -4, fontSize: 11 }} />
                <YAxis dataKey="grade" name="Avg Grade %" unit="%" type="number" domain={[50, 100]} className="text-xs" label={{ value: 'Avg Grade %', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload as ScatterPoint | undefined;
                  if (!d) return null;
                  return (
                    <div className="rounded-lg border border-border bg-surface p-2 text-xs shadow-lg">
                      <p className="font-semibold text-text-primary">{d.name}</p>
                      <p className="text-text-secondary">Attendance: {d.attendance}%</p>
                      <p className="text-text-secondary">Grade: {d.grade}%</p>
                    </div>
                  );
                }} />
                <Scatter data={MOCK_SCATTER} fill="#6366f1" opacity={0.8} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab: Cost per Student */}
      {activeTab === 'cost-per-student' && (
        <div className="space-y-6">
          <FindingCallout text={t('insights.findingCostPerStudent')} />
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('insights.costChartTitle')}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={MOCK_COST} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip formatter={(v) => [`${String(v)}`, t('insights.costPerStudent')]} />
                <Line type="monotone" dataKey="cost_per_student" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab: Year Group Health */}
      {activeTab === 'year-group-health' && (
        <div className="space-y-6">
          <FindingCallout text={t('insights.findingYearGroupHealth')} />
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {['yearGroup', 'healthScore', 'attendance', 'grades', 'collection', 'atRisk'].map((col) => (
                    <th key={col} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t(`insights.col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_HEALTH.map((row, i) => (
                  <tr key={row.year_group} className="border-b border-border last:border-b-0 hover:bg-surface-secondary">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-secondary text-xs font-bold text-text-secondary">{i + 1}</span>
                        <span className="text-sm font-medium text-text-primary">{row.year_group}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-text-primary">{row.score}</span>
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-secondary">
                          <div className={`h-2 rounded-full ${row.score >= 85 ? 'bg-emerald-500' : row.score >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${row.score}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><MetricCell value={row.attendance} /></td>
                    <td className="px-4 py-3"><MetricCell value={row.grades} /></td>
                    <td className="px-4 py-3"><MetricCell value={row.collection} /></td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.incidents <= 2 ? 'bg-emerald-100 text-emerald-700' : row.incidents <= 4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {row.incidents}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Teacher Effectiveness */}
      {activeTab === 'teacher-effectiveness' && (
        <div className="space-y-6">
          <FindingCallout text={t('insights.findingTeacherEffectiveness')} />
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('insights.effectivenessChartTitle')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={MOCK_EFFECTIVENESS} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" domain={[0, 100]} className="text-xs" />
                <YAxis dataKey="teacher" type="category" className="text-xs" width={80} />
                <Tooltip />
                <Bar dataKey="marking_compliance" name={t('insights.col.markingCompliance')} fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="avg_student_grade" name={t('insights.col.avgStudentGrade')} fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  {['teacher', 'markingCompliance', 'gradeEntry', 'avgStudentGrade', 'avgStudentAttendance'].map((col) => (
                    <th key={col} className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t(`insights.col.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_EFFECTIVENESS.map((row) => (
                  <tr key={row.teacher} className="border-b border-border last:border-b-0 hover:bg-surface-secondary">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.teacher}</td>
                    <td className="px-4 py-3"><MetricCell value={row.marking_compliance} /></td>
                    <td className="px-4 py-3"><MetricCell value={row.grade_entry} /></td>
                    <td className="px-4 py-3"><MetricCell value={row.avg_student_grade} /></td>
                    <td className="px-4 py-3"><MetricCell value={row.avg_student_attendance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!['attendance-grades', 'cost-per-student', 'year-group-health', 'teacher-effectiveness'].includes(activeTab) && (
        <EmptyState icon={TrendingUp} title={t('noData')} description="" />
      )}
    </div>
  );
}
