'use client';

import { Download, FileText, Printer, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { BoardReport } from '@school/shared/reports';
import { Button } from '@school/ui';

import { AcademicSection } from './sections/academic-section';
import { AttendanceSection } from './sections/attendance-section';
import { BehaviourSection } from './sections/behaviour-section';
import { EnrolmentSection } from './sections/enrolment-section';
import { ExecutiveSummarySection } from './sections/executive-summary-section';
import { FinanceSection } from './sections/finance-section';
import { SafeguardingSection } from './sections/safeguarding-section';
import { StaffingSection } from './sections/staffing-section';

interface BoardReportDisplayProps {
  report: BoardReport;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onExportWord?: () => void;
  onShare?: () => void;
}

export function BoardReportDisplay({
  report,
  onExportPdf,
  onExportExcel,
  onExportWord,
  onShare,
}: BoardReportDisplayProps) {
  const t = useTranslations('reports');

  return (
    <div className="space-y-6 print:space-y-4" data-testid="board-report-display">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between print:border-b-2 print:border-black">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">{t('board.title')}</h2>
          <p className="text-sm text-text-tertiary">
            {report.tenant.term_label} · {report.tenant.academic_year_name}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('board.generatedAt')} {new Date(report.generated_at).toLocaleString()}
            {report.anonymise && (
              <span className="ms-2 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                {t('board.anonymisedBadge')}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden" data-testid="board-export-bar">
          {onExportPdf && (
            <Button
              size="sm"
              variant="outline"
              onClick={onExportPdf}
              data-testid="board-export-pdf"
            >
              <Printer className="me-2 h-3.5 w-3.5" />
              {t('board.exportPdf')}
            </Button>
          )}
          {onExportExcel && (
            <Button
              size="sm"
              variant="outline"
              onClick={onExportExcel}
              data-testid="board-export-excel"
            >
              <Download className="me-2 h-3.5 w-3.5" />
              {t('board.exportExcel')}
            </Button>
          )}
          {onExportWord && (
            <Button
              size="sm"
              variant="outline"
              onClick={onExportWord}
              data-testid="board-export-word"
            >
              <FileText className="me-2 h-3.5 w-3.5" />
              {t('board.exportWord')}
            </Button>
          )}
          {onShare && (
            <Button size="sm" onClick={onShare} data-testid="board-share">
              <Share2 className="me-2 h-3.5 w-3.5" />
              {t('board.share')}
            </Button>
          )}
        </div>
      </header>

      {/* Sections */}
      <div className="space-y-6 print:space-y-4">
        {report.sections.executive && (
          <div className="print:break-inside-avoid">
            <ExecutiveSummarySection section={report.sections.executive} />
          </div>
        )}

        {report.sections.enrolment && (
          <div className="print:break-before-page print:break-inside-avoid">
            <EnrolmentSection section={report.sections.enrolment} />
          </div>
        )}

        {report.sections.attendance && (
          <div className="print:break-before-page print:break-inside-avoid">
            <AttendanceSection section={report.sections.attendance} />
          </div>
        )}

        {report.sections.academic && (
          <div className="print:break-before-page print:break-inside-avoid">
            <AcademicSection section={report.sections.academic} anonymise={report.anonymise} />
          </div>
        )}

        {report.sections.behaviour && (
          <div className="print:break-before-page print:break-inside-avoid">
            <BehaviourSection section={report.sections.behaviour} />
          </div>
        )}

        {report.sections.safeguarding && (
          <div className="print:break-before-page print:break-inside-avoid">
            <SafeguardingSection section={report.sections.safeguarding} />
          </div>
        )}

        {report.sections.finance && (
          <div className="print:break-before-page print:break-inside-avoid">
            <FinanceSection section={report.sections.finance} />
          </div>
        )}

        {report.sections.staffing && (
          <div className="print:break-before-page print:break-inside-avoid">
            <StaffingSection section={report.sections.staffing} />
          </div>
        )}
      </div>
    </div>
  );
}
