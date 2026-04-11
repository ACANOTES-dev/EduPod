'use client';

import { Loader2, Search, X } from 'lucide-react';
import * as React from 'react';

import type { InboxPeopleSearchResult } from '@school/shared/inbox';
import { Avatar, AvatarFallback, Badge, Input, cn } from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * PeoplePicker — recipient picker for the compose dialog's Direct and
 * Group tabs. Two modes: `single` (replaces the pick) and `multi`
 * (chips above the input). Results come from the policy-filtered
 * `GET /v1/inbox/people-search` — so the picker can never surface a
 * user the sender cannot actually message.
 */

type PickedUser = Pick<InboxPeopleSearchResult, 'user_id' | 'display_name' | 'role_label'>;

interface BaseProps {
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface SingleProps extends BaseProps {
  mode: 'single';
  value: PickedUser | null;
  onChange: (value: PickedUser | null) => void;
}

interface MultiProps extends BaseProps {
  mode: 'multi';
  value: PickedUser[];
  onChange: (value: PickedUser[]) => void;
  maxRecipients?: number;
}

type Props = SingleProps | MultiProps;

const DEBOUNCE_MS = 200;

export function PeoplePicker(props: Props) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<InboxPeopleSearchResult[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const picked: PickedUser[] =
    props.mode === 'multi' ? props.value : props.value ? [props.value] : [];
  const pickedIds = React.useMemo(() => new Set(picked.map((p) => p.user_id)), [picked]);

  React.useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      apiClient<{ data: InboxPeopleSearchResult[] }>(
        `/api/v1/inbox/people-search?q=${encodeURIComponent(trimmed)}&limit=20`,
        { method: 'GET', signal: controller.signal, silent: true },
      )
        .then((res) => {
          if (controller.signal.aborted) return;
          setResults(res.data ?? []);
          setHighlightedIndex(0);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error('[people-picker.search]', err);
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [query, isOpen]);

  const visibleResults = React.useMemo(
    () => results.filter((r) => !pickedIds.has(r.user_id)),
    [results, pickedIds],
  );

  const selectUser = React.useCallback(
    (user: InboxPeopleSearchResult) => {
      const asPicked: PickedUser = {
        user_id: user.user_id,
        display_name: user.display_name,
        role_label: user.role_label,
      };
      if (props.mode === 'single') {
        props.onChange(asPicked);
        setQuery('');
        setIsOpen(false);
      } else {
        if (props.maxRecipients && props.value.length >= props.maxRecipients) return;
        props.onChange([...props.value, asPicked]);
        setQuery('');
      }
    },
    [props],
  );

  const removeUser = React.useCallback(
    (userId: string) => {
      if (props.mode === 'single') {
        props.onChange(null);
      } else {
        props.onChange(props.value.filter((u) => u.user_id !== userId));
      }
    },
    [props],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || visibleResults.length === 0) {
      if (
        e.key === 'Backspace' &&
        query.length === 0 &&
        props.mode === 'multi' &&
        props.value.length > 0
      ) {
        const last = props.value[props.value.length - 1];
        if (last) removeUser(last.user_id);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = visibleResults[highlightedIndex];
      if (target) selectUser(target);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {picked.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {picked.map((u) => (
            <Badge
              key={u.user_id}
              variant="secondary"
              className="flex items-center gap-1.5 py-1 ps-2 pe-1"
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {initialsOf(u.display_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{u.display_name}</span>
              <button
                type="button"
                aria-label={`Remove ${u.display_name}`}
                onClick={() => removeUser(u.user_id)}
                className="rounded-full p-0.5 hover:bg-background/40"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          id={props.id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
          placeholder={props.placeholder}
          disabled={props.disabled}
          className="ps-9"
          autoComplete="off"
        />
      </div>
      {isOpen && (query.length > 0 || visibleResults.length > 0) && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          {isLoading && visibleResults.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-sm text-text-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="p-3 text-sm text-text-tertiary">No users match.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {visibleResults.map((user, idx) => (
                <li
                  key={user.user_id}
                  role="option"
                  aria-selected={idx === highlightedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectUser(user);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                    idx === highlightedIndex ? 'bg-background/60' : 'bg-transparent',
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {initialsOf(user.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-text-primary">{user.display_name}</span>
                    <span className="truncate text-xs text-text-tertiary">
                      {user.role_label}
                      {user.email ? ` · ${user.email}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}
