'use client';

import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, Input } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

// ─── People Picker ────────────────────────────────────────────────────────────
//
// Minimal multi-select user picker for the static audience builder. Impl 11
// will ship a richer version wired into the compose dialog; this file is
// self-contained so impl 12 can land before 11.
//
// Data source: GET /v1/users?search=... (existing endpoint, requires
// `users.view`). Admin-tier roles have both users.view and inbox.send so
// the feature works for them. Teachers with only inbox.send cannot
// handpick — documented as a follow-up.

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface UserListResponse {
  data: UserRow[];
  meta?: { page: number; pageSize: number; total: number };
}

interface PeoplePickerProps {
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  initialDisplayNames?: Record<string, string>;
  disabled?: boolean;
}

function displayName(u: UserRow): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return name || u.email;
}

export function PeoplePicker({
  selectedUserIds,
  onChange,
  initialDisplayNames,
  disabled = false,
}: PeoplePickerProps) {
  const t = useTranslations('inbox.audiences.peoplePicker');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [results, setResults] = React.useState<UserRow[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectedNames, setSelectedNames] = React.useState<Record<string, string>>(
    initialDisplayNames ?? {},
  );

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);

  React.useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    apiClient<UserListResponse>(
      `/api/v1/users?search=${encodeURIComponent(debounced)}&pageSize=20`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const rows = unwrap<UserListResponse>(res).data ?? [];
        setResults(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[PeoplePicker.search]', err);
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const toggleUser = (user: UserRow) => {
    const isSelected = selectedUserIds.includes(user.id);
    if (isSelected) {
      onChange(selectedUserIds.filter((id) => id !== user.id));
    } else {
      onChange([...selectedUserIds, user.id]);
      setSelectedNames((prev) => ({ ...prev, [user.id]: displayName(user) }));
    }
  };

  const removeUser = (userId: string) => {
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="ps-9"
          disabled={disabled}
          aria-label={t('searchPlaceholder')}
        />
        {isSearching && (
          <Loader2
            className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-secondary"
            aria-hidden="true"
          />
        )}
      </div>

      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-background">
          <ul className="divide-y divide-border">
            {results.map((u) => {
              const isSelected = selectedUserIds.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => toggleUser(u)}
                    disabled={disabled}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text-primary">{displayName(u)}</div>
                      <div className="truncate text-xs text-text-secondary">{u.email}</div>
                    </div>
                    {isSelected ? (
                      <Badge variant="secondary" className="shrink-0">
                        {t('selected')}
                      </Badge>
                    ) : (
                      <UserPlus className="h-4 w-4 shrink-0 text-text-secondary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedUserIds.length === 0 ? (
        <p className="text-xs text-text-secondary">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">
            {t('selectedCount', { count: selectedUserIds.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedUserIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-text-primary"
              >
                <span className="max-w-[12rem] truncate">
                  {selectedNames[id] ?? id.slice(0, 8)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 text-text-secondary hover:text-text-primary"
                  onClick={() => removeUser(id)}
                  disabled={disabled}
                  aria-label={t('removeUser')}
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
