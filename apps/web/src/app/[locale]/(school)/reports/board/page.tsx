'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  BoardReport,
  BoardReportHistoryEntry,
  BoardReportHistoryResponse,
  BoardReportRequest,
  BoardReportSectionKey,
} from '@school/shared/reports';
import { BOARD_REPORT_SECTION_KEYS } from '@school/shared/reports';
import { toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { BoardReportDisplay } from './_components/board-report-display';
import { BoardReportGenerationControls } from './_components/board-report-generation-controls';
import { BoardReportHistory } from './_components/board-report-history';

interface AcademicYear {
  id: string;
  name: string;
}

const ALL_SECTION_KEYS: ReadonlySet<BoardReportSectionKey> = new Set(BOARD_REPORT_SECTION_KEYS);

export default function BoardReportPage() {
  const t = useTranslations('reports');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [loadingYears, setLoadingYears] = React.useState(true);

  const [selectedYearId, setSelectedYearId] = React.useState('');
  const [selectedTerm, setSelectedTerm] = React.useState('1');
  const [selectedSections, setSelectedSections] = React.useState<Set<BoardReportSectionKey>>(
    () => new Set(BOARD_REPORT_SECTION_KEYS),
  );
  const [anonymise, setAnonymise] = React.useState(true);

  const [generating, setGenerating] = React.useState(false);
  const [report, setReport] = React.useState<BoardReport | null>(null);

  const [history, setHistory] = React.useState<BoardReportHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  // Fetch academic years on mount
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data.length > 0 && res.data[0]) {
          setSelectedYearId(res.data[0].id);
        }
      })
      .catch((err) => {
        console.error('[BoardReportPage] Failed to load academic years', err);
      })
      .finally(() => setLoadingYears(false));
  }, []);

  // Fetch history on mount
  const refreshHistory = React.useCallback(() => {
    setLoadingHistory(true);
    apiClient<BoardReportHistoryResponse>('/api/v1/reports/board/history')
      .then((res) => setHistory(res.data))
      .catch((err) => {
        console.error('[BoardReportPage] Failed to load history', err);
      })
      .finally(() => setLoadingHistory(false));
  }, []);

  React.useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const toggleSection = (sectionKey: BoardReportSectionKey) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  const toggleAllSections = (checked: boolean) => {
    setSelectedSections(checked ? new Set(ALL_SECTION_KEYS) : new Set());
  };

  const handleGenerate = async () => {
    if (!selectedYearId) return;

    setGenerating(true);
    try {
      const req: BoardReportRequest = {
        term: {
          academic_year_id: selectedYearId,
          term_number: Number.parseInt(selectedTerm, 10),
        },
        sections: Array.from(selectedSections),
        anonymise,
      };

      const res = await apiClient<{ data: BoardReport }>('/api/v1/reports/board', {
        method: 'POST',
        body: JSON.stringify(req),
      });

      setReport(res.data);
      refreshHistory();
      toast.success(t('board.generateSuccess'));
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      console.error('[BoardReportPage] Generate failed:', err);
      toast.error(apiErr?.message ?? t('board.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPdf = React.useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  const handleExportNotImplemented = React.useCallback(
    (format: 'excel' | 'word') => {
      toast.message(t('board.exportComingSoon', { format: format.toUpperCase() }));
    },
    [t],
  );

  const handleShare = React.useCallback(() => {
    toast.message(t('board.shareNotYetWired'));
  }, [t]);

  const handleLoadHistory = React.useCallback(
    (historyEntry: BoardReportHistoryEntry) => {
      // No board-history payload endpoint yet — surface a friendly toast
      // so the user understands re-generation is the path. Tracked as a
      // follow-up in the impl 20 completion record.
      toast.message(
        t('board.history.reloadComingSoon', {
          date: new Date(historyEntry.generated_at).toLocaleDateString(),
        }),
      );
    },
    [t],
  );

  return (
    <div className="space-y-8 print:space-y-4" data-testid="board-report-page">
      <div className="print:hidden">
        <PageHeader title={t('board.title')} description={t('board.description')} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Controls */}
        <div className="lg:col-span-1 print:hidden">
          <BoardReportGenerationControls
            academicYears={academicYears}
            selectedYearId={selectedYearId}
            onYearChange={setSelectedYearId}
            selectedTerm={selectedTerm}
            onTermChange={setSelectedTerm}
            selectedSections={selectedSections}
            onToggleSection={toggleSection}
            onToggleAllSections={toggleAllSections}
            anonymise={anonymise}
            onAnonymiseChange={setAnonymise}
            generating={generating}
            onGenerate={handleGenerate}
            loadingYears={loadingYears}
          />
        </div>

        {/* Report Display + Empty/Loading states */}
        <div className="lg:col-span-2 space-y-8 print:col-span-3">
          {report && (
            <BoardReportDisplay
              report={report}
              onExportPdf={handleExportPdf}
              onExportExcel={() => handleExportNotImplemented('excel')}
              onExportWord={() => handleExportNotImplemented('word')}
              onShare={handleShare}
            />
          )}

          {!report && !generating && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center print:hidden">
              <p className="text-sm text-text-tertiary">{t('board.noReportGenerated')}</p>
            </div>
          )}

          {generating && (
            <div className="space-y-3 print:hidden">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="print:hidden">
        <BoardReportHistory history={history} loading={loadingHistory} onLoad={handleLoadHistory} />
      </div>
    </div>
  );
}
