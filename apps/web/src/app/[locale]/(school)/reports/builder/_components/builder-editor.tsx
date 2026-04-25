'use client';

import * as React from 'react';

import { AskAiInput } from './ask-ai-input';
import {
  DEFAULT_AGG_BY_TYPE, type Aggregation, type BuilderState, type FilterGroup,
  type ReportSubjectKey, type SavedReportQuery, type SubjectDescriptor,
} from './builder-types';
import { FieldTree } from './field-tree';
import { FilterBuilder } from './filter-builder';
import { GroupByToggle } from './group-by-toggle';
import { SubjectPicker } from './subject-picker';

interface BuilderEditorProps {
  subjects: SubjectDescriptor[];
  activeSubject: SubjectDescriptor | null;
  state: BuilderState;
  onChange: (next: BuilderState) => void;
  askAiEnabled: boolean;
  rationale: string | null;
  onAskAiTranslated: (query: SavedReportQuery, rationale: string) => void;
  onAskAiDiscard: () => void;
}

export function BuilderEditor({
  subjects, activeSubject, state, onChange, askAiEnabled, rationale,
  onAskAiTranslated, onAskAiDiscard,
}: BuilderEditorProps) {
  const setSubject = (subjectKey: ReportSubjectKey) => {
    if (state.subjectKey === subjectKey) return;
    onChange({
      subjectKey, selectedFieldIds: [], columnAggregations: {},
      filters: { combinator: 'and', filters: [] }, groupByFieldId: null,
      chartType: 'table', chartConfig: {},
    });
  };

  const toggleField = (fieldId: string) => {
    const exists = state.selectedFieldIds.includes(fieldId);
    const nextIds = exists ? state.selectedFieldIds.filter((id) => id !== fieldId) : [...state.selectedFieldIds, fieldId];
    onChange({ ...state, selectedFieldIds: nextIds });
  };

  const setFilters = (filters: FilterGroup) => onChange({ ...state, filters });

  const addFilterForField = (fieldId: string) => {
    if (!activeSubject) return;
    const field = activeSubject.fields.find((f) => f.id === fieldId);
    if (!field || !field.filterable) return;
    const op = field.type === 'string' ? 'contains' : 'equals';
    setFilters({
      ...state.filters,
      filters: [...state.filters.filters, { field_id: fieldId, operator: op, value: '' }],
    });
  };

  const setGroupBy = (fieldId: string | null) => {
    if (!activeSubject) { onChange({ ...state, groupByFieldId: fieldId }); return; }
    const next: BuilderState = { ...state, groupByFieldId: fieldId };
    if (fieldId !== null) {
      const seeded: Record<string, Aggregation> = { ...state.columnAggregations };
      for (const id of state.selectedFieldIds) {
        if (id === fieldId) continue;
        if (seeded[id]) continue;
        const f = activeSubject.fields.find((x) => x.id === id);
        if (f) seeded[id] = DEFAULT_AGG_BY_TYPE[f.type];
      }
      next.columnAggregations = seeded;
    } else {
      next.columnAggregations = {};
    }
    onChange(next);
  };

  const setColumnAggregation = (fieldId: string, agg: Aggregation) => {
    onChange({ ...state, columnAggregations: { ...state.columnAggregations, [fieldId]: agg } });
  };

  const handleAskAiTranslated = (result: { query: SavedReportQuery; rationale: string }) => {
    const fieldIds = result.query.columns.map((c) => c.field_id);
    const next: BuilderState = {
      subjectKey: result.query.subject,
      selectedFieldIds: fieldIds,
      columnAggregations: Object.fromEntries(
        result.query.columns.filter((c) => c.aggregation).map((c) => [c.field_id, c.aggregation!]),
      ),
      filters: result.query.filters ?? { combinator: 'and', filters: [] },
      groupByFieldId: result.query.group_by?.[0]?.field_id ?? null,
      chartType: 'table', chartConfig: {},
    };
    onChange(next);
    onAskAiTranslated(result.query, result.rationale);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <AskAiInput enabled={askAiEnabled} onTranslated={handleAskAiTranslated} rationale={rationale} onDiscard={onAskAiDiscard} />

      {state.subjectKey === null ? (
        <SubjectPicker subjects={subjects} selected={state.subjectKey} onSelect={setSubject} />
      ) : activeSubject ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Subject</p>
              <p className="text-sm font-semibold text-text-primary">
                {activeSubject.label_key.split('.').slice(-1)[0]} · {activeSubject.fields.length} fields
              </p>
            </div>
            <button type="button" onClick={() => onChange({ ...state, subjectKey: null })}
              className="text-xs font-medium text-primary hover:underline">
              Change
            </button>
          </div>

          <FieldTree subject={activeSubject} selected={state.selectedFieldIds} groupByFieldId={state.groupByFieldId}
            onToggleField={toggleField} onAddFilter={addFilterForField} onSetGroupBy={setGroupBy} />

          <FilterBuilder subject={activeSubject} filters={state.filters} onChange={setFilters} />

          <GroupByToggle subject={activeSubject} groupByFieldId={state.groupByFieldId}
            selectedColumnIds={state.selectedFieldIds} columnAggregations={state.columnAggregations}
            onToggle={(enabled) => {
              if (!enabled) setGroupBy(null);
              else {
                const firstGroupable = activeSubject.fields.find((f) => f.groupable);
                if (firstGroupable) setGroupBy(firstGroupable.id);
              }
            }}
            onChangeField={(id) => setGroupBy(id)} onChangeAggregation={setColumnAggregation} />
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">Loading subject…</p>
      )}
    </div>
  );
}
