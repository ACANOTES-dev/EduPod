'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { QueryExecutionResult } from '@school/shared/reports';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { humaniseFieldLabel, type SavedReportChartType, type SubjectDescriptor } from './builder-types';
import { ChartRenderer } from './chart-renderer';

interface PreviewPaneProps {
  loading: boolean;
  error: string | null;
  result: QueryExecutionResult | null;
  chartType: SavedReportChartType;
  chartConfig: { x_axis_field_id?: string; y_axis_field_id?: string; kpi_field_id?: string };
  onChartConfigChange: (config: { x_axis_field_id?: string; y_axis_field_id?: string; kpi_field_id?: string }) => void;
  subject: SubjectDescriptor | null;
}

export function PreviewPane({ loading, error, result, chartType, chartConfig, onChartConfigChange, subject }: PreviewPaneProps) {
  const t = useTranslations('reports.builder.previewPane');
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">{t('errorTitle')}</p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }
  if (!result) return null;
  if (result.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-12 text-center">
        <p className="text-sm text-text-tertiary">{t('empty')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PreviewMeta result={result} />
      {chartType === 'table' ? (
        <PreviewTable result={result} subject={subject} />
      ) : (
        <ChartContainer
          result={result}
          chartType={chartType}
          chartConfig={chartConfig}
          onChartConfigChange={onChartConfigChange}
          subject={subject}
        />
      )}
    </div>
  );
}

function PreviewMeta({ result }: { result: QueryExecutionResult }) {
  const t = useTranslations('reports.builder.previewPane');
  const { row_count, truncated, execution_ms } = result.meta;
  const visible = result.rows.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
      <span>{t('showing')} <span className="font-semibold text-text-secondary">{visible}</span> {t('of')} <span className="font-semibold text-text-secondary">{row_count}</span> {t('rows')}</span>
      <span className="font-mono">{execution_ms} {t('ms')}{truncated && ' · truncated'}</span>
    </div>
  );
}

function PreviewTable({ result, subject }: { result: QueryExecutionResult; subject: SubjectDescriptor | null }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            {result.columns.map((col) => {
              const field = subject?.fields.find((f) => f.id === col.id);
              const label = field ? humaniseFieldLabel(field) : col.id.split('.').slice(-1)[0]!;
              return (<th key={col.id} className="px-3 py-2 text-start font-semibold text-text-secondary whitespace-nowrap">{label}</th>);
            })}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-border last:border-b-0 hover:bg-surface-secondary">
              {result.columns.map((col) => (<td key={col.id} className="px-3 py-2 text-text-primary">{formatCell(row[col.id], col.type)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—';
  if (type === 'date' && typeof value === 'string') {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString();
  }
  if (type === 'currency' && typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface ChartContainerProps {
  result: QueryExecutionResult;
  chartType: SavedReportChartType;
  chartConfig: { x_axis_field_id?: string; y_axis_field_id?: string; kpi_field_id?: string };
  onChartConfigChange: (config: { x_axis_field_id?: string; y_axis_field_id?: string; kpi_field_id?: string }) => void;
  subject: SubjectDescriptor | null;
}

function ChartContainer({ result, chartType, chartConfig, onChartConfigChange, subject }: ChartContainerProps) {
  const t = useTranslations('reports.builder.viz');
  const numericColumns = result.columns.filter((c) => c.type === 'number' || c.type === 'currency');
  const dimensionColumns = result.columns.filter((c) => c.type === 'string' || c.type === 'enum' || c.type === 'date');
  const xId = chartConfig.x_axis_field_id ?? dimensionColumns[0]?.id ?? result.columns[0]?.id;
  const yId = chartConfig.y_axis_field_id ?? numericColumns[0]?.id ?? result.columns[result.columns.length - 1]?.id;
  const kpiId = chartConfig.kpi_field_id ?? numericColumns[0]?.id ?? result.columns[0]?.id;

  if (chartType === 'kpi') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">{t('kpi')}:</span>
          <Select value={kpiId ?? ''} onValueChange={(v) => onChartConfigChange({ ...chartConfig, kpi_field_id: v })}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {result.columns.map((c) => {
                const field = subject?.fields.find((f) => f.id === c.id);
                const label = field ? humaniseFieldLabel(field) : c.id.split('.').slice(-1)[0]!;
                return (<SelectItem key={c.id} value={c.id}>{label}</SelectItem>);
              })}
            </SelectContent>
          </Select>
        </div>
        <ChartRenderer chartType="kpi" result={result} xAxisFieldId={null} yAxisFieldId={null} kpiFieldId={kpiId ?? null} />
      </div>
    );
  }

  if (chartType === 'table') return null;

  if (!xId || !yId) {
    return (<div className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-text-tertiary">{t('needAxes')}</div>);
  }

  const optionLabel = (cId: string) => {
    const field = subject?.fields.find((f) => f.id === cId);
    return field ? humaniseFieldLabel(field) : cId.split('.').slice(-1)[0]!;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <AxisPicker label={t('xAxis')} value={xId} options={result.columns.map((c) => ({ value: c.id, label: optionLabel(c.id) }))}
          onChange={(v) => onChartConfigChange({ ...chartConfig, x_axis_field_id: v })} />
        <AxisPicker label={t('yAxis')} value={yId} options={result.columns.map((c) => ({ value: c.id, label: optionLabel(c.id) }))}
          onChange={(v) => onChartConfigChange({ ...chartConfig, y_axis_field_id: v })} />
      </div>
      <ChartRenderer chartType={chartType} result={result} xAxisFieldId={xId} yAxisFieldId={yId} kpiFieldId={null} />
    </div>
  );
}

function AxisPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-tertiary">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}
