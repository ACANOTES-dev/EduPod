'use client';

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@school/ui';

import {
  filterableFields, findField, humaniseFieldLabel, isFilterLeaf, OPERATORS_BY_TYPE,
  type FieldDescriptor, type FilterGroup, type FilterLeaf, type FilterOperator, type SubjectDescriptor,
} from './builder-types';

interface FilterBuilderProps {
  subject: SubjectDescriptor;
  filters: FilterGroup;
  onChange: (filters: FilterGroup) => void;
}

export function FilterBuilder({ subject, filters, onChange }: FilterBuilderProps) {
  const t = useTranslations('reports.builder.filters');
  const filterable = filterableFields(subject);
  const leafChildren = filters.filters.filter(isFilterLeaf) as FilterLeaf[];

  const update = (next: FilterGroup) => onChange(next);
  const setCombinator = (combinator: 'and' | 'or') => update({ ...filters, combinator });

  const addFilter = () => {
    if (filterable.length === 0) return;
    const firstField = filterable[0]!;
    const operator = OPERATORS_BY_TYPE[firstField.type][0]!;
    update({ ...filters, filters: [...filters.filters, { field_id: firstField.id, operator, value: '' }] });
  };

  const updateLeaf = (index: number, patch: Partial<FilterLeaf>) => {
    const next = filters.filters.map((node, i) => {
      if (i !== index) return node;
      if (!isFilterLeaf(node)) return node;
      return { ...node, ...patch };
    });
    update({ ...filters, filters: next });
  };

  const removeLeaf = (index: number) => {
    update({ ...filters, filters: filters.filters.filter((_, i) => i !== index) });
  };

  if (filterable.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-text-primary">{t('title')}</h4>
        {leafChildren.length > 1 && (
          <Select value={filters.combinator} onValueChange={(v) => setCombinator(v === 'or' ? 'or' : 'and')}>
            <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="and">{t('combinator.and')}</SelectItem>
              <SelectItem value="or">{t('combinator.or')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-2">
        {filters.filters.map((node, index) => {
          if (!isFilterLeaf(node)) return null;
          const field = findField(subject, node.field_id);
          return (
            <FilterRow
              key={`${node.field_id}-${index}`}
              index={index}
              node={node}
              field={field ?? null}
              allFields={filterable}
              onUpdate={(patch) => updateLeaf(index, patch)}
              onRemove={() => removeLeaf(index)}
            />
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addFilter}>
        <Plus className="me-2 h-4 w-4" />{t('add')}
      </Button>
    </div>
  );
}

interface FilterRowProps {
  index: number;
  node: FilterLeaf;
  field: FieldDescriptor | null;
  allFields: FieldDescriptor[];
  onUpdate: (patch: Partial<FilterLeaf>) => void;
  onRemove: () => void;
}

function FilterRow({ index, node, field, allFields, onUpdate, onRemove }: FilterRowProps) {
  const t = useTranslations('reports.builder.filters');
  const operators: FilterOperator[] = field ? OPERATORS_BY_TYPE[field.type] : [];

  const setField = (newFieldId: string) => {
    const newField = allFields.find((f) => f.id === newFieldId);
    if (!newField) return;
    const newOperator = OPERATORS_BY_TYPE[newField.type][0]!;
    onUpdate({ field_id: newFieldId, operator: newOperator, value: '' });
  };

  const setOperator = (operator: FilterOperator) => onUpdate({ operator });

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-2 sm:grid-cols-[1fr_140px_1fr_auto]">
      <Select value={node.field_id} onValueChange={setField}>
        <SelectTrigger className="h-9 text-sm" data-testid={`filter-field-${index}`}><SelectValue placeholder={t('field')} /></SelectTrigger>
        <SelectContent>
          {allFields.map((f) => (<SelectItem key={f.id} value={f.id}>{humaniseFieldLabel(f)}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={node.operator} onValueChange={(v) => setOperator(v as FilterOperator)}>
        <SelectTrigger className="h-9 text-sm" data-testid={`filter-op-${index}`}><SelectValue placeholder={t('operator')} /></SelectTrigger>
        <SelectContent>
          {operators.map((op) => (<SelectItem key={op} value={op}>{t(`operators.${op}`)}</SelectItem>))}
        </SelectContent>
      </Select>
      <FilterValueInput field={field} operator={node.operator} value={node.value} onChange={(v) => onUpdate({ value: v })} index={index} />
      <button type="button" onClick={onRemove}
        className="rounded-md p-2 text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary"
        aria-label={t('remove')} data-testid={`filter-remove-${index}`}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface FilterValueInputProps {
  field: FieldDescriptor | null;
  operator: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
  index: number;
}

function FilterValueInput({ field, operator, value, onChange, index }: FilterValueInputProps) {
  const t = useTranslations('reports.builder.filters');
  if (operator === 'is_null' || operator === 'is_not_null') {
    return <div className="flex h-9 items-center px-3 text-sm text-text-tertiary" data-testid={`filter-value-${index}`}>—</div>;
  }
  if (!field) {
    return (
      <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={t('valuePlaceholder')}
        className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
        data-testid={`filter-value-${index}`} />
    );
  }
  if (field.type === 'enum' && field.enum_values && operator === 'equals') {
    return (
      <Select value={String(value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm" data-testid={`filter-value-${index}`}><SelectValue placeholder={t('value')} /></SelectTrigger>
        <SelectContent>
          {field.enum_values.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <Select value={value === true ? 'true' : value === false ? 'false' : ''} onValueChange={(v) => onChange(v === 'true')}>
        <SelectTrigger className="h-9 text-sm" data-testid={`filter-value-${index}`}><SelectValue placeholder={t('value')} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t('true')}</SelectItem>
          <SelectItem value="false">{t('false')}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : 'text';
  return (
    <input type={inputType} value={String(value ?? '')}
      onChange={(e) => onChange(inputType === 'number' ? Number(e.target.value) : e.target.value)}
      placeholder={t('valuePlaceholder')}
      className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
      data-testid={`filter-value-${index}`} />
  );
}
