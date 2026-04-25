'use client';

import { GraduationCap, Search, Sparkles } from 'lucide-react';
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

import { Button, EmptyState, Input } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentSearchResult {
  id: string;
  name: string;
  year_group: string;
  student_number: string | null;
}

interface SearchResponse {
  data: StudentSearchResult[];
}

// ─── Mock student progress data ───────────────────────────────────────────────

interface SubjectGrade {
  subject: string;
  T1: number;
  T2: number;
  T3: number;
}
interface AttendancePoint {
  month: string;
  rate: number;
}
interface Alert {
  date: string;
  type: string;
  description: string;
}
interface Competency {
  name: string;
  score: number;
}

const MOCK_GRADES: SubjectGrade[] = [
  { subject: 'Math', T1: 72, T2: 75, T3: 78 },
  { subject: 'Science', T1: 68, T2: 74, T3: 80 },
  { subject: 'English', T1: 83, T2: 85, T3: 86 },
  { subject: 'Arabic', T1: 79, T2: 81, T3: 82 },
];

const MOCK_ATTENDANCE: AttendancePoint[] = [
  { month: 'Oct', rate: 88 },
  { month: 'Nov', rate: 91 },
  { month: 'Dec', rate: 84 },
  { month: 'Jan', rate: 93 },
  { month: 'Feb', rate: 96 },
  { month: 'Mar', rate: 94 },
];

const MOCK_ALERTS: Alert[] = [
  { date: '2025-01-15', type: 'Attendance', description: 'Attendance dropped below 85% threshold' },
  { date: '2025-02-10', type: 'Grade', description: 'Math grade below passing threshold in T1' },
];

const MOCK_COMPETENCIES: Competency[] = [
  { name: 'Critical Thinking', score: 72 },
  { name: 'Communication', score: 85 },
  { name: 'Numeracy', score: 68 },
  { name: 'Literacy', score: 80 },
  { name: 'Digital Skills', score: 78 },
];

const TERMS = ['T1', 'T2', 'T3'] as const;
type Term = (typeof TERMS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentProgressPage() {
  const t = useTranslations('reports');

  const [search, setSearch] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<StudentSearchResult[]>([]);
  const [_searching, setSearching] = React.useState(false);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentSearchResult | null>(null);
  const [selectedTerm, setSelectedTerm] = React.useState<Term>('T3');
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  const handleSearch = React.useCallback(async () => {
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await apiClient<SearchResponse>(
        `/api/v1/students/search?q=${encodeURIComponent(search)}&pageSize=8`,
      );
      setSearchResults(res.data);
    } catch (err) {
      console.error('[ReportsStudentProgressPage]', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [search]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void handleSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [handleSearch]);

  const handleAiSummarise = async () => {
    if (!selectedStudent) return;
    setAiLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setAiSummary(`${selectedStudent.name} ${t('studentProgress.aiSummaryFallback')}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studentProgress.title')}
        description={t('studentProgress.description')}
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchStudentPlaceholder')}
          className="ps-10"
        />
        {searchResults.length > 0 && search.length >= 2 && !selectedStudent && (
          <div className="absolute start-0 end-0 top-full z-10 mt-1 rounded-xl border border-border bg-surface shadow-lg">
            {searchResults.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedStudent(s);
                  setSearch(s.name);
                  setSearchResults([]);
                  setAiSummary(null);
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-secondary first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">{s.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {s.year_group} {s.student_number ? `· ${s.student_number}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedStudent ? (
        <EmptyState
          icon={GraduationCap}
          title={t('studentProgress.selectStudentTitle')}
          description={t('studentProgress.selectStudentDesc')}
        />
      ) : (
        <div className="space-y-6">
          {/* Student header */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold text-text-primary">{selectedStudent.name}</p>
                <p className="text-sm text-text-secondary">{selectedStudent.year_group}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Term selector */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {TERMS.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSelectedTerm(term)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${selectedTerm === term ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-surface-secondary'}`}
                  >
                    {term}
                  </button>
                ))}
              </div>
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
          </div>

          {aiSummary && (
            <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <p className="text-sm text-violet-900">{aiSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Grade Sparklines per Subject */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('studentProgress.gradesTitle')}
              </h3>
              <div className="space-y-3">
                {MOCK_GRADES.map((sg) => {
                  const current = sg[selectedTerm];
                  return (
                    <div key={sg.subject} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">{sg.subject}</span>
                        <span
                          className={`text-sm font-semibold ${current >= 80 ? 'text-emerald-600' : current >= 65 ? 'text-amber-600' : 'text-red-500'}`}
                        >
                          {current}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                        <div
                          className={`h-2 rounded-full ${current >= 80 ? 'bg-emerald-500' : current >= 65 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${current}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attendance trend */}
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('studentProgress.attendanceTitle')}
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={MOCK_ATTENDANCE} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis domain={[75, 100]} className="text-xs" />
                  <Tooltip formatter={(v) => [`${String(v)}%`, t('attendance.attendanceRate')]} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alerts Timeline */}
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('studentProgress.alertsTitle')}
            </h3>
            {MOCK_ALERTS.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('studentProgress.noAlerts')}</p>
            ) : (
              <ol className="relative border-s border-border ps-4 space-y-4">
                {MOCK_ALERTS.map((alert) => (
                  <li key={alert.date} className="ms-2">
                    <div className="absolute -start-1.5 mt-1 h-3 w-3 rounded-full border border-border bg-amber-400" />
                    <time className="text-xs text-text-tertiary">{alert.date}</time>
                    <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {alert.type}
                    </span>
                    <p className="mt-1 text-sm text-text-secondary">{alert.description}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Competency Bars */}
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('studentProgress.competenciesTitle')}
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={MOCK_COMPETENCIES}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" domain={[0, 100]} className="text-xs" />
                <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                <Tooltip formatter={(v) => [`${String(v)}%`]} />
                <Bar dataKey="score" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
