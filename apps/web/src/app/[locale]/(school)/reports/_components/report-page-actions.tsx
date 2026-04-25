'use client';

import { CalendarClock, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

interface ReportPageActionsProps {
  /**
   * Optional handler invoked when an export button is clicked. Receives the
   * chosen format. If omitted, the buttons render as disabled (used for
   * pages that don't yet have an export pipeline wired up — they will be
   * filled in when impl 19 lands the saved-report management surface).
   */
  onExport?: (format: 'pdf' | 'excel' | 'word') => void;

  /**
   * Optional handler invoked when the Schedule button is clicked. Used by
   * impl 17 to open the scheduled-reports modal pre-populated with the
   * current page's report identifier. Until impl 17 ships, `onSchedule` is
   * undefined and the button stays disabled.
   */
  onSchedule?: () => void;

  /**
   * Disable everything in one go — useful when the page itself is loading
   * or in error state so the user can't trigger an export against missing
   * data. Defaults to `false`.
   */
  disabled?: boolean;
}

/**
 * Per-report action bar. Renders Export PDF / Excel / Word buttons plus a
 * Schedule trigger. Designed to be passed as the `actions` prop on the
 * report page's `<PageHeader />`.
 *
 * The actual Excel / Word / PDF rendering pipeline lives behind
 * `POST /v1/reports/builder/:reportId/export` and is consumed by saved
 * custom reports today (impl 04 + impl 13). For non-builder analytics
 * pages we render the buttons but leave them inert until impl 19 (saved
 * reports management) provides a per-analytics-page export route.
 */
export function ReportPageActions({ onExport, onSchedule, disabled = false }: ReportPageActionsProps) {
  const t = useTranslations('reports');

  const exportEnabled = Boolean(onExport) && !disabled;
  const scheduleEnabled = Boolean(onSchedule) && !disabled;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onExport?.('pdf')}
        disabled={!exportEnabled}
        title={exportEnabled ? t('exports.exportPdf') : t('exports.exportComingSoon')}
      >
        <FileText className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('exports.pdf')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onExport?.('excel')}
        disabled={!exportEnabled}
        title={exportEnabled ? t('exports.exportExcel') : t('exports.exportComingSoon')}
      >
        <FileSpreadsheet className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('exports.excel')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onExport?.('word')}
        disabled={!exportEnabled}
        title={exportEnabled ? t('exports.exportWord') : t('exports.exportComingSoon')}
      >
        <FileType className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('exports.word')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSchedule?.()}
        disabled={!scheduleEnabled}
        title={scheduleEnabled ? t('exports.schedule') : t('exports.scheduleComingSoon')}
      >
        <CalendarClock className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('exports.schedule')}
      </Button>
    </div>
  );
}
