'use client';

import { AlertTriangle, Download, FileText, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ComplianceReportResponse } from '@school/shared/reports';
import { Button, toast } from '@school/ui';

import {
  countComplianceGaps,
  formatComplianceValue,
  relativeTimeFromIso,
} from './compliance-format';

interface CompliancePreviewPaneProps {
  report: ComplianceReportResponse;
  onShare?: () => void;
}

export function CompliancePreviewPane({ report, onShare }: CompliancePreviewPaneProps) {
  const t = useTranslations('reports');

  const gapCount = countComplianceGaps(report.fields);
  const completeCount = report.fields.length - gapCount;

  const handleExportPdf = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    window.print();
  }, []);

  const handleExportNotImplemented = React.useCallback(
    (format: 'excel' | 'word') => {
      toast.message(t('compliance.exportComingSoon', { format: format.toUpperCase() }));
    },
    [t],
  );

  const handleShareClick = React.useCallback(() => {
    if (onShare) {
      onShare();
    } else {
      toast.message(t('compliance.shareNotYetWired'));
    }
  }, [onShare, t]);

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"
      data-testid="compliance-preview-pane"
    >
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between print:border-b-2 print:border-black">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t('compliance.previewTitle')}
          </h2>
          <p className="text-sm text-text-tertiary">
            {report.tenant.name} · {report.tenant.academic_year.name}
          </p>
          <p className="text-xs text-text-tertiary">
            {t('compliance.generatedAt')} {new Date(report.meta.generated_at).toLocaleString()}
            {' · '}
            {t('compliance.catalogueVersion', { version: report.meta.catalogue_version })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPdf}
            data-testid="compliance-export-pdf"
          >
            <Download className="me-2 h-3.5 w-3.5" />
            {t('compliance.exportPdf')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportNotImplemented('excel')}
            data-testid="compliance-export-excel"
          >
            <FileText className="me-2 h-3.5 w-3.5" />
            {t('compliance.exportExcel')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportNotImplemented('word')}
            data-testid="compliance-export-word"
          >
            <FileText className="me-2 h-3.5 w-3.5" />
            {t('compliance.exportWord')}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleShareClick}
            data-testid="compliance-share"
          >
            <Share2 className="me-2 h-3.5 w-3.5" />
            {t('compliance.share')}
          </Button>
        </div>
      </header>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
          data-testid="compliance-complete-count"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {t('compliance.completeCount', { count: completeCount })}
        </div>
        <div
          className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
          data-testid="compliance-gap-count"
        >
          <AlertTriangle className="h-3 w-3" />
          {t('compliance.gapCount', { count: gapCount })}
        </div>
      </div>

      {/* Field rows */}
      <ul className="space-y-2">
        {report.fields.map((field) => {
          const valueDisplay = formatComplianceValue(field);
          return (
            <li
              key={field.key}
              className={`grid grid-cols-1 gap-1 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4 ${
                field.has_gap
                  ? 'border-amber-200 bg-amber-50/40 print:border-black'
                  : 'border-border bg-surface print:border-black'
              }`}
              data-testid={`compliance-field-${field.key}`}
              data-has-gap={field.has_gap}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {t(`compliance.field.${field.key}`)}
                  </p>
                  {field.has_gap && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                      title={field.gap_reason ?? t('compliance.gapGeneric')}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {t('compliance.gapBadge')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary">
                  {t('compliance.sourceLabel')}{' '}
                  <span className="font-mono text-text-secondary">{field.source}</span>
                  {' · '}
                  {t('compliance.lastVerified', {
                    relative: relativeTimeFromIso(field.last_verified_at),
                  })}
                </p>
                {field.has_gap && field.gap_reason && (
                  <p className="text-xs italic text-amber-700">
                    {t('compliance.gapReasonLabel')} {field.gap_reason}
                  </p>
                )}
              </div>
              <div className="text-end">
                <p
                  className={`font-mono text-base ${
                    field.has_gap ? 'text-amber-700' : 'text-text-primary'
                  }`}
                >
                  {valueDisplay}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
