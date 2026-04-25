'use client';

import { ChevronDown, Filter, Lock, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Checkbox } from '@school/ui';

import {
  humaniseDomain,
  humaniseFieldLabel,
  type FieldDescriptor,
  type SubjectDescriptor,
} from './builder-types';

interface FieldTreeProps {
  subject: SubjectDescriptor;
  selected: string[];
  groupByFieldId: string | null;
  onToggleField: (fieldId: string) => void;
  onAddFilter: (fieldId: string) => void;
  onSetGroupBy: (fieldId: string | null) => void;
}

interface DomainBucket { domain: string; fields: FieldDescriptor[]; }

export function FieldTree({ subject, selected, groupByFieldId, onToggleField, onAddFilter, onSetGroupBy }: FieldTreeProps) {
  const t = useTranslations('reports.builder.fields');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedDomains, setExpandedDomains] = React.useState<Set<string>>(new Set());
  const initialisedSubject = React.useRef<string | null>(null);

  const buckets = React.useMemo<DomainBucket[]>(() => {
    const filteredFields = subject.fields.filter((f) => {
      if (searchQuery === '') return true;
      const needle = searchQuery.toLowerCase();
      return (
        f.id.toLowerCase().includes(needle) ||
        humaniseFieldLabel(f).toLowerCase().includes(needle) ||
        f.label_key.toLowerCase().includes(needle)
      );
    });
    const map = new Map<string, FieldDescriptor[]>();
    for (const field of filteredFields) {
      const existing = map.get(field.domain);
      if (existing) existing.push(field);
      else map.set(field.domain, [field]);
    }
    return Array.from(map.entries()).map(([domain, fields]) => ({ domain, fields }));
  }, [subject, searchQuery]);

  React.useEffect(() => {
    if (initialisedSubject.current === subject.key) return;
    initialisedSubject.current = subject.key;
    setExpandedDomains(new Set(buckets.slice(0, 2).map((b) => b.domain)));
  }, [subject.key, buckets]);

  const isSearching = searchQuery.length > 0;

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const safeT = (key: string, fallback: string): string => {
    try { return t(key); } catch { return fallback; }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="search"
          placeholder={t('search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface ps-9 pe-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label={t('search')}
        />
      </div>

      {buckets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-6 text-center text-xs text-text-tertiary">{t('noFields')}</p>
      ) : (
        <div className="space-y-1">
          {buckets.map(({ domain, fields }) => {
            const isExpanded = isSearching || expandedDomains.has(domain);
            const domainLabel = safeT(`domains.${domain}`, humaniseDomain(domain));
            return (
              <div key={domain} className="rounded-lg">
                <button
                  type="button"
                  onClick={() => toggleDomain(domain)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-text-primary hover:bg-surface-secondary"
                  aria-expanded={isExpanded}
                  data-testid={`domain-${domain}`}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  <span className="flex-1 text-start">{domainLabel}</span>
                  <span className="text-xs font-normal text-text-tertiary">{fields.length}</span>
                </button>
                {isExpanded && (
                  <ul className="ms-2 space-y-0.5 border-s border-border ps-3 py-1">
                    {fields.map((field) => {
                      const isSelected = selected.includes(field.id);
                      const isGroupBy = groupByFieldId === field.id;
                      const fieldLabel = humaniseFieldLabel(field);
                      return (
                        <li key={field.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-secondary">
                          <Checkbox
                            id={`field-${field.id}`}
                            checked={isSelected}
                            onCheckedChange={() => onToggleField(field.id)}
                            aria-label={fieldLabel}
                          />
                          <label htmlFor={`field-${field.id}`} className="flex-1 cursor-pointer truncate text-sm text-text-secondary">
                            {fieldLabel}
                          </label>
                          {field.permission && <Lock className="h-3 w-3 text-text-tertiary" aria-label="Permission-gated" />}
                          {field.filterable && (
                            <button
                              type="button"
                              onClick={() => onAddFilter(field.id)}
                              className="rounded p-1 opacity-0 transition-opacity hover:bg-surface group-hover:opacity-100"
                              data-testid={`add-filter-${field.id}`}
                              aria-label="Use as filter"
                              title={fieldLabel}
                            >
                              <Filter className="h-3 w-3 text-text-tertiary" />
                            </button>
                          )}
                          {field.groupable && (
                            <button
                              type="button"
                              onClick={() => onSetGroupBy(isGroupBy ? null : field.id)}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase transition-colors ${
                                isGroupBy ? 'bg-primary text-white' : 'bg-surface text-text-tertiary opacity-0 group-hover:opacity-100 hover:bg-surface-secondary'
                              }`}
                              data-testid={`group-by-${field.id}`}
                              title="Group by"
                            >
                              GB
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
