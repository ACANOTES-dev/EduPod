'use client';

import { Search, X } from 'lucide-react';
import { startTransition, useDeferredValue } from 'react';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import type { SearchOption } from '@/lib/pastoral';

interface SearchPickerProps {
  label: string;
  placeholder: string;
  search: (query: string) => Promise<SearchOption[]>;
  selected: SearchOption[];
  onChange: (next: SearchOption[]) => void;
  emptyText: string;
  minSearchLengthText: string;
  multiple?: boolean;
  helperText?: string;
  disabledIds?: string[];
}

export function SearchPicker({
  label,
  placeholder,
  search,
  selected,
  onChange,
  emptyText,
  minSearchLengthText,
  multiple = true,
  helperText,
  disabledIds = [],
}: SearchPickerProps) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const deferredQuery = useDeferredValue(query.trim());

  React.useEffect(() => {
    let cancelled = false;

    if (deferredQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);

    void search(deferredQuery)
      .then((nextResults) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setResults(nextResults);
          setIsLoading(false);
        });
      })
      .catch((err) => {
        console.error('[SearchPicker]', err);
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setResults([]);
          setIsLoading(false);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, search]);

  const unavailableIds = React.useMemo(
    () => new Set([...disabledIds, ...selected.map((option) => option.id)]),
    [disabledIds, selected],
  );

  const handleSelect = React.useCallback(
    (option: SearchOption) => {
      if (multiple) {
        onChange([...selected, option]);
      } else {
        onChange([option]);
      }

      setQuery('');
      setResults([]);
    },
    [multiple, onChange, selected],
  );

  const handleRemove = React.useCallback(
    (optionId: string) => {
      onChange(selected.filter((option) => option.id !== optionId));
    },
    [onChange, selected],
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1 text-sm text-text-primary"
            >
              <span>{option.label}</span>
              <button
                type="button"
                onClick={() => handleRemove(option.id)}
                className="rounded-full text-text-tertiary transition-colors hover:text-text-primary"
                aria-label={`Remove ${option.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-text-tertiary" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="ps-9"
          autoComplete="off"
        />
        {query.trim().length >= 2 ? (
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <div className="max-h-60 overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-3 text-sm text-text-tertiary">{emptyText}</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-3 text-sm text-text-tertiary">{emptyText}</div>
              ) : (
                results.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant="ghost"
                    className="flex h-auto w-full items-start justify-between rounded-none px-4 py-3 text-start"
                    disabled={unavailableIds.has(option.id)}
                    onClick={() => handleSelect(option)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="block truncate text-xs text-text-tertiary">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-text-tertiary">{helperText ?? minSearchLengthText}</p>
    </div>
  );
}
