'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Child {
  id: string;
  name: string;
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface SubjectGrade {
  subject_name: string;
  final_score: number | null;
  final_letter: string | null;
}

interface HistoryReportCard {
  id: string;
  academic_period_id: string;
  academic_period_name: string;
  academic_year_name: string;
  published_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  subject_grades: SubjectGrade[];
}

interface GradesData {
  grades: SubjectGrade[];
  report_cards: Array<{
    id: string;
    academic_period_name: string;
    published_at: string;
  }>;
}

interface ListResponse<T> {
  data: T[];
}

interface GradesTabProps {
  students: Child[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GradesTab({ students: children }: GradesTabProps) {
  const t = useTranslations('gradebook');
  const tr = useTranslations('reportCards');
  const tt = useTranslations('transcripts');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = React.useState<'grades' | 'history' | 'compare'>('grades');
  const [selectedChild, setSelectedChild] = React.useState(children[0]?.id ?? '');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState('');
  const [gradesData, setGradesData] = React.useState<GradesData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // History
  const [history, setHistory] = React.useState<HistoryReportCard[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [expandedRc, setExpandedRc] = React.useState<string | null>(null);
  const [acknowledging, setAcknowledging] = React.useState<string | null>(null);

  // Compare
  const [comparePeriodA, setComparePeriodA] = React.useState('');
  const [comparePeriodB, setComparePeriodB] = React.useState('');
  const [compareDataA, setCompareDataA] = React.useState<SubjectGrade[] | null>(null);
  const [compareDataB, setCompareDataB] = React.useState<SubjectGrade[] | null>(null);
  const [compareLoading, setCompareLoading] = React.useState(false);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/parent/academic-periods')
      .then((res) => {
        setPeriods(res.data);
        if (res.data.length > 0) setSelectedPeriod(res.data[0]!.id);
      })
      .catch(() => undefined);
  }, []);

  const fetchGrades = React.useCallback(async (studentId: string, periodId: string) => {
    if (!studentId || !periodId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ student_id: studentId, academic_period_id: periodId });
      const res = await apiClient<{ data: GradesData }>(
        `/api/v1/gradebook/student-grades?${params.toString()}`,
      );
      setGradesData(res.data);
    } catch {
      setGradesData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchHistory = React.useCallback(async (studentId: string) => {
    if (!studentId) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ student_id: studentId });
      const res = await apiClient<{ data: HistoryReportCard[] }>(
        `/api/v1/parent/report-card-history?${params.toString()}`,
      );
      setHistory(res.data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedChild && selectedPeriod) void fetchGrades(selectedChild, selectedPeriod);
  }, [selectedChild, selectedPeriod, fetchGrades]);

  React.useEffect(() => {
    if (activeTab === 'history' && selectedChild) void fetchHistory(selectedChild);
  }, [activeTab, selectedChild, fetchHistory]);

  const handleViewPdf = (reportCardId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    window.open(`${baseUrl}/api/v1/report-cards/${reportCardId}/pdf`, '_blank');
  };

  const handleDownloadTranscript = () => {
    if (!selectedChild) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    window.open(`${baseUrl}/api/v1/transcripts/${selectedChild}/pdf`, '_blank');
  };

  const handleAcknowledge = async (reportCardId: string) => {
    setAcknowledging(reportCardId);
    try {
      await apiClient(`/api/v1/parent/report-cards/${reportCardId}/acknowledge`, { method: 'POST' });
      toast.success(tr('acknowledged'));
      void fetchHistory(selectedChild);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setAcknowledging(null);
    }
  };

  const handleCompare = async () => {
    if (!comparePeriodA || !comparePeriodB || !selectedChild) return;
    setCompareLoading(true);
    try {
      const [resA, resB] = await Promise.all([
        apiClient<{ data: GradesData }>(
          `/api/v1/gradebook/student-grades?${new URLSearchParams({ student_id: selectedChild, academic_period_id: comparePeriodA }).toString()}`,
        ),
        apiClient<{ data: GradesData }>(
          `/api/v1/gradebook/student-grades?${new URLSearchParams({ student_id: selectedChild, academic_period_id: comparePeriodB }).toString()}`,
        ),
      ]);
      setCompareDataA(resA.data.grades);
      setCompareDataB(resB.data.grades);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setCompareLoading(false);
    }
  };

  // Group history by academic year
  const historyByYear = React.useMemo(() => {
    const map = new Map<string, HistoryReportCard[]>();
    for (const rc of history) {
      const year = rc.academic_year_name;
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(rc);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  const subTabs = [
    { key: 'grades' as const, label: tr('currentGrades') },
    { key: 'history' as const, label: tr('reportCardHistory') },
    { key: 'compare' as const, label: tr('comparePeriods') },
  ];

  return (
    <div className="space-y-5">
      {/* Student selector */}
      {children.length > 1 && (
        <Select value={selectedChild} onValueChange={setSelectedChild}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Select student" />
          </SelectTrigger>
          <SelectContent>
            {children.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Sub-tabs */}
      <nav className="flex gap-1 border-b border-border" aria-label="Grades tabs">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none ${
              activeTab === tab.key
                ? 'text-primary-700 border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Current Grades tab */}
      {activeTab === 'grades' && (
        <div className="space-y-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('period')} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
              ))}
            </div>
          ) : gradesData ? (
            <>
              {gradesData.grades.length === 0 ? (
                <p className="text-sm text-text-tertiary">{tc('noResults')}</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface-secondary">
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                          {t('subject')}
                        </th>
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                          {t('score')}
                        </th>
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                          Grade
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradesData.grades.map((g) => (
                        <tr key={g.subject_name} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {g.subject_name}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-text-secondary" dir="ltr">
                            {g.final_score != null ? g.final_score : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {g.final_letter ? (
                              <StatusBadge status="info">{g.final_letter}</StatusBadge>
                            ) : (
                              <span className="text-text-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Published report cards for this period */}
              {gradesData.report_cards.length > 0 && (
                <div className="space-y-2">
                  {gradesData.report_cards.map((rc) => (
                    <div
                      key={rc.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">{rc.academic_period_name}</p>
                        <p className="font-mono text-xs text-text-tertiary" dir="ltr">
                          {new Date(rc.published_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleViewPdf(rc.id)}>
                        <FileText className="me-1 h-4 w-4" />
                        {tr('preview')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Transcript download */}
              <div className="pt-2">
                <Button variant="outline" onClick={handleDownloadTranscript}>
                  <Download className="me-2 h-4 w-4" />
                  {tt('download')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Report Card History tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{tc('noResults')}</p>
          ) : (
            historyByYear.map(([year, rcs]) => (
              <div key={year} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-text-tertiary">{year}</h3>
                {rcs.map((rc) => (
                  <div key={rc.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedRc(expandedRc === rc.id ? null : rc.id)}
                        className="flex flex-1 items-center gap-3 text-start min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {rc.academic_period_name}
                          </p>
                          <p className="font-mono text-xs text-text-tertiary" dir="ltr">
                            {new Date(rc.published_at).toLocaleDateString()}
                          </p>
                        </div>
                        {rc.acknowledged ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
                        ) : (
                          <StatusBadge status="warning" dot>{tr('notAcknowledged')}</StatusBadge>
                        )}
                        {expandedRc === rc.id ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                        )}
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => handleViewPdf(rc.id)}>
                        <FileText className="me-1 h-3.5 w-3.5" />
                        {tr('preview')}
                      </Button>
                    </div>

                    {/* Expanded: grades + acknowledge */}
                    {expandedRc === rc.id && (
                      <div className="border-t border-border p-3 space-y-3">
                        {rc.subject_grades.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border bg-surface-secondary">
                                  <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                                    {t('subject')}
                                  </th>
                                  <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                                    {t('score')}
                                  </th>
                                  <th className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                                    Grade
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {rc.subject_grades.map((g) => (
                                  <tr key={g.subject_name} className="border-b border-border last:border-b-0">
                                    <td className="px-3 py-2 text-text-primary">{g.subject_name}</td>
                                    <td className="px-3 py-2 font-mono text-text-secondary" dir="ltr">
                                      {g.final_score ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                      {g.final_letter ? (
                                        <StatusBadge status="info">{g.final_letter}</StatusBadge>
                                      ) : (
                                        <span className="text-text-tertiary">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!rc.acknowledged && (
                          <Button
                            size="sm"
                            onClick={() => void handleAcknowledge(rc.id)}
                            disabled={acknowledging === rc.id}
                          >
                            {acknowledging === rc.id ? (
                              <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="me-2 h-3.5 w-3.5" />
                            )}
                            {tr('acknowledgeReceipt')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Compare Periods tab */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">{tr('periodA')}</label>
              <Select value={comparePeriodA} onValueChange={setComparePeriodA}>
                <SelectTrigger>
                  <SelectValue placeholder={tr('selectPeriodA')} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">{tr('periodB')}</label>
              <Select value={comparePeriodB} onValueChange={setComparePeriodB}>
                <SelectTrigger>
                  <SelectValue placeholder={tr('selectPeriodB')} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => void handleCompare()}
              disabled={compareLoading || !comparePeriodA || !comparePeriodB}
              className="shrink-0 w-full sm:w-auto"
            >
              {compareLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {tr('compare')}
            </Button>
          </div>

          {compareDataA && compareDataB && (
            <CompareTable
              dataA={compareDataA}
              dataB={compareDataB}
              periodAName={periods.find((p) => p.id === comparePeriodA)?.name ?? comparePeriodA}
              periodBName={periods.find((p) => p.id === comparePeriodB)?.name ?? comparePeriodB}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compare Table ────────────────────────────────────────────────────────────

function CompareTable({
  dataA,
  dataB,
  periodAName,
  periodBName,
  t,
}: {
  dataA: SubjectGrade[];
  dataB: SubjectGrade[];
  periodAName: string;
  periodBName: string;
  t: ReturnType<typeof useTranslations<'gradebook'>>;
}) {
  // Merge subjects from both periods
  const subjects = Array.from(
    new Set([...dataA.map((g) => g.subject_name), ...dataB.map((g) => g.subject_name)]),
  );

  const mapA = new Map(dataA.map((g) => [g.subject_name, g]));
  const mapB = new Map(dataB.map((g) => [g.subject_name, g]));

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
              {t('subject')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
              {periodAName}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
              {periodBName}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => {
            const a = mapA.get(subject);
            const b = mapB.get(subject);
            const scoreA = a?.final_score ?? null;
            const scoreB = b?.final_score ?? null;
            const diff =
              scoreA != null && scoreB != null ? scoreB - scoreA : null;
            return (
              <tr key={subject} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{subject}</td>
                <td className="px-4 py-3 font-mono text-sm text-text-secondary" dir="ltr">
                  {scoreA != null ? scoreA : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-sm text-text-secondary" dir="ltr">
                  {scoreB != null ? scoreB : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-sm" dir="ltr">
                  {diff != null ? (
                    <span
                      className={
                        diff > 0
                          ? 'text-success-600'
                          : diff < 0
                          ? 'text-error-600'
                          : 'text-text-tertiary'
                      }
                    >
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
