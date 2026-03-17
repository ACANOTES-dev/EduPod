'use client';

import { Download, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

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

interface PublishedReportCard {
  id: string;
  academic_period_name: string;
  published_at: string;
}

interface GradesData {
  grades: SubjectGrade[];
  report_cards: PublishedReportCard[];
}

interface ListResponse<T> {
  data: T[];
}

interface GradesTabProps {
  children: Child[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GradesTab({ children }: GradesTabProps) {
  const t = useTranslations('gradebook');
  const tr = useTranslations('reportCards');
  const tt = useTranslations('transcripts');
  const tc = useTranslations('common');

  const [selectedChild, setSelectedChild] = React.useState(children[0]?.id ?? '');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = React.useState('');
  const [gradesData, setGradesData] = React.useState<GradesData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => {
        setPeriods(res.data);
        if (res.data.length > 0) {
          setSelectedPeriod(res.data[0]!.id);
        }
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

  React.useEffect(() => {
    if (selectedChild && selectedPeriod) {
      void fetchGrades(selectedChild, selectedPeriod);
    }
  }, [selectedChild, selectedPeriod, fetchGrades]);

  const handleViewPdf = (reportCardId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5552';
    window.open(`${baseUrl}/api/v1/report-cards/${reportCardId}/pdf`, '_blank');
  };

  const handleDownloadTranscript = () => {
    if (!selectedChild) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5552';
    window.open(`${baseUrl}/api/v1/transcripts/${selectedChild}/pdf`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select student" />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grades by subject */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : gradesData ? (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('periodGrades')}</h3>
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
                        <td className="px-4 py-3 text-sm font-mono text-text-secondary" dir="ltr">
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
          </div>

          {/* Published report cards */}
          {gradesData.report_cards.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">{tr('title')}</h3>
              <div className="space-y-2">
                {gradesData.report_cards.map((rc) => (
                  <div
                    key={rc.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{rc.academic_period_name}</p>
                      <p className="text-xs text-text-tertiary font-mono" dir="ltr">
                        {new Date(rc.published_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewPdf(rc.id)}
                    >
                      <FileText className="me-1 h-4 w-4" />
                      {tr('preview')}
                    </Button>
                  </div>
                ))}
              </div>
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
  );
}
