'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
} from '@school/ui';

import {
  DEFAULT_AGG_BY_TYPE,
  groupableFields,
  humaniseFieldLabel,
  type Aggregation,
  type FieldDescriptor,
  type SubjectDescriptor,
} from './builder-types';

interface GroupByToggleProps {
  subject: SubjectDescriptor;
  groupByFieldId: string | null;
  selectedColumnIds: string[];
  columnAggregations: Record<string, Aggregation>;
  onToggle: (enabled: boolean) => void;
  onChangeField: (fieldId: string) => void;
  onChangeAggregation: (columnId: string, agg: Aggregation) => void;
}

const ALL_AGGREGATIONS: Aggregation[] = ['count', 'sum', 'avg', 'min', 'max', 'percent'];

export function GroupByToggle({
  subject, groupByFieldId, selectedColumnIds, columnAggregations,
  onToggle, onChangeField, onChangeAggregation,
}: GroupByToggleProps) {
  const t = useTranslations('reports.builder.groupBy');
  const groupable = groupableFields(subject);
  const enabled = groupByFieldId !== null;

  if (groupable.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs text-text-tertiary">
        {t('noGroupableFields')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <Switch checked={enabled} onCheckedChange={(v) => onToggle(Boolean(v))} aria-label={t('title')} />
        <span className="text-sm font-semibold text-text-primary">{t('title')}</span>
      </label>

      {enabled && (
        <div className="space-y-3 rounded-lg bg-surface-secondary p-3">
          <div>
            <label className="text-xs font-medium text-text-secondary">{t('selectField')}</label>
            <Select value={groupByFieldId ?? ''} onValueChange={(v) => onChangeField(v)}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder={t('selectFieldPlaceholder')} /></SelectTrigger>
              <SelectContent>
                {groupable.map((f) => (<SelectItem key={f.id} value={f.id}>{humaniseFieldLabel(f)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {selectedColumnIds.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-text-secondary">{t('columnAggregations')}</h5>
              {selectedColumnIds.map((columnId) => {
                const field = subject.fields.find((f) => f.id === columnId);
                if (!field || field.id === groupByFieldId) return null;
                return (
                  <ColumnAggregationRow
                    key={columnId}
                    field={field}
                    aggregation={columnAggregations[columnId] ?? DEFAULT_AGG_BY_TYPE[field.type]}
                    onChange={(agg) => onChangeAggregation(columnId, agg)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ColumnAggregationRowProps {
  field: FieldDescriptor;
  aggregation: Aggregation;
  onChange: (agg: Aggregation) => void;
}

function ColumnAggregationRow({ field, aggregation, onChange }: ColumnAggregationRowProps) {
  const t = useTranslations('reports.builder.groupBy');
  const allowed = field.aggregations ?? ALL_AGGREGATIONS;
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate text-xs text-text-secondary">{humaniseFieldLabel(field)}</span>
      <Select value={aggregation} onValueChange={(v) => onChange(v as Aggregation)}>
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowed.map((agg) => (<SelectItem key={agg} value={agg}>{t(`agg.${agg}`)}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}
