'use client';

import { Download, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoardReport {
  id: string;
  title: string;
  report_type: 'termly' | 'annual';
  generated_at: string;
  file_url: string | null;
}

interface HistoryResponse {
  data: BoardReport[];
}

const SECTIONS = [
  'executive_summary',
  'enrolment_demographics',
  'academic_performance',
  'attendance_summary',
  'financial_overview',
  'staffing_summary',
  'admissions_pipeline',
  'achievements_concerns',
] as const;

type SectionKey = (typeof SECTIONS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BoardReportPage() {
  const t = useTranslations('reports');

  const [reportType, setReportType] = React.useState<'termly' | 'annual'>('termly');
  const [period, setPeriod] = React.useState('');
  const [selectedSections, setSelectedSections] = React.useState<Set<SectionKey>>(
    new Set(SECTIONS),
  );
  const [generating, setGenerating] = React.useState(false);
  const [history, setHistory] = React.useState<BoardReport[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const [preview, setPreview] = React.useState<BoardReport | null>(null);

  React.useEffect(() => {
    apiClient<HistoryResponse>('/api/v1/reports/board?pageSize=10')
      .then((res) => setHistory(res.data))
      .catch((err) => { console.error('[ReportsBoardPage]', err); })
      .finally(() => setLoadingHistory(false));
  }, []);

  const toggleSection = (key: SectionKey) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiClient<{ data: BoardReport }>('/api/v1/reports/board', {
        method: 'POST',
        body: JSON.stringify({
          report_type: reportType,
          period,
          sections: Array.from(selectedSections),
        }),
      });
      setPreview(res.data);
      setHistory((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error('[ReportsBoardPage]', err);
      // Mock preview for now
      const mock: BoardReport = {
        id: crypto.randomUUID(),
        title: `${reportType === 'termly' ? 'Termly' : 'Annual'} Board Report — ${period || 'Current Period'}`,
        report_type: reportType,
        generated_at: new Date().toISOString(),
        file_url: null,
      };
      setPreview(mock);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t('board.title')} description={t('board.description')} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Create Form */}
        <section className="space-y-6 rounded-xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="text-base font-semibold text-text-primary">{t('board.createTitle')}</h2>

          <div className="space-y-4">
            <div>
              <Label>{t('board.reportType')}</Label>
              <Select
                value={reportType}
                onValueChange={(v) => setReportType(v as 'termly' | 'annual')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="termly">{t('board.termly')}</SelectItem>
                  <SelectItem value="annual">{t('board.annual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="board-period">{t('board.period')}</Label>
              <input
                id="board-period"
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder={t('board.periodPlaceholder')}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <Label>{t('board.sectionsLabel')}</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SECTIONS.map((section) => (
                  <label key={section} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedSections.has(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <span className="text-sm text-text-secondary">
                      {t(`board.section.${section}`)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              onClick={() => void handleGenerate()}
              disabled={generating || selectedSections.size === 0}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('board.generating')}
                </>
              ) : (
                t('board.generateButton')
              )}
            </Button>
          </div>
        </section>

        {/* Preview */}
        {preview && (
          <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">
                {t('board.previewTitle')}
              </h2>
              <Button size="sm" variant="outline" disabled={!preview.file_url}>
                <Download className="me-2 h-4 w-4" />
                {t('board.downloadPdf')}
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{preview.title}</p>
                  <p className="text-xs text-text-tertiary">
                    {t('board.generatedAt')} {new Date(preview.generated_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1">
                {Array.from(selectedSections).map((s) => (
                  <div key={s} className="flex items-center gap-2 text-xs text-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t(`board.section.${s}`)}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* History */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('board.historyTitle')}
        </h2>
        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('board.noHistory')}</p>
        ) : (
          <div className="space-y-2">
            {history.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{report.title}</p>
                    <p className="text-xs text-text-tertiary">
                      {new Date(report.generated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={!report.file_url}>
                  <Download className="me-1 h-3.5 w-3.5" />
                  {t('board.download')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
