'use client';

import { Loader2, Search, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ReportShareFormat } from '@school/shared/reports';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  cn,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * ShareDialog (impl 19) — drives the saved-report → inbox sharing flow.
 *
 * Posts to `POST /v1/reports/builder/:id/share` with a
 * `{ format, audience: { user_ids, role_keys }, message_body? }` body.
 * Reuses the inbox `GET /v1/inbox/people-search` endpoint for the
 * direct-recipient picker so we never surface a user the sender can't
 * actually message under the tenant policy.
 *
 * Role-group recipients use the canonical `system_roles.role_key`
 * values from `packages/prisma/seed/system-roles.ts`. The backend's
 * audience-translation layer (`report-sharing.service.ts:translate`)
 * fans these out via the inbox `staff_role` provider.
 */

interface PickedUser {
  user_id: string;
  display_name: string;
  role_label: string;
}

interface InboxPeopleSearchResult extends PickedUser {
  email?: string;
}

export interface ShareDialogReport {
  id: string;
  name: string;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ShareDialogReport | null;
  onSuccess?: (shareId: string) => void;
}

interface RoleOption {
  key: string;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { key: 'school_owner', label: 'shareDialog.roles.school_owner' },
  { key: 'school_principal', label: 'shareDialog.roles.school_principal' },
  { key: 'school_vice_principal', label: 'shareDialog.roles.school_vice_principal' },
  { key: 'admin', label: 'shareDialog.roles.admin' },
  { key: 'teacher', label: 'shareDialog.roles.teacher' },
  { key: 'attendance_officer', label: 'shareDialog.roles.attendance_officer' },
  { key: 'accounting', label: 'shareDialog.roles.accounting' },
  { key: 'front_office', label: 'shareDialog.roles.front_office' },
];

const DEBOUNCE_MS = 200;

export function ShareDialog({ open, onOpenChange, report, onSuccess }: ShareDialogProps) {
  const t = useTranslations('reports.builder');
  const [format, setFormat] = React.useState<ReportShareFormat>('pdf');
  const [selectedRoles, setSelectedRoles] = React.useState<Set<string>>(new Set());
  const [pickedUsers, setPickedUsers] = React.useState<PickedUser[]>([]);
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // ─── People search (mirrors inbox PeoplePicker) ──────────────────────────
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<InboxPeopleSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const searchAbortRef = React.useRef<AbortController | null>(null);

  const pickedIds = React.useMemo(() => new Set(pickedUsers.map((u) => u.user_id)), [pickedUsers]);

  const visibleResults = React.useMemo(
    () => searchResults.filter((r) => !pickedIds.has(r.user_id)),
    [searchResults, pickedIds],
  );

  React.useEffect(() => {
    if (!searchOpen) return;
    const trimmed = searchQuery.trim();
    const handle = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);
      apiClient<{ data: InboxPeopleSearchResult[] }>(
        `/api/v1/inbox/people-search?q=${encodeURIComponent(trimmed)}&limit=20`,
        { method: 'GET', signal: controller.signal, silent: true },
      )
        .then((res) => {
          if (controller.signal.aborted) return;
          setSearchResults(res.data ?? []);
          setHighlightedIndex(0);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error('[ShareDialog.peopleSearch]', err);
          setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
      searchAbortRef.current?.abort();
    };
  }, [searchQuery, searchOpen]);

  const toggleRole = (roleKey: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleKey)) {
        next.delete(roleKey);
      } else {
        next.add(roleKey);
      }
      return next;
    });
  };

  const removeRole = (roleKey: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      next.delete(roleKey);
      return next;
    });
  };

  const addUser = (user: InboxPeopleSearchResult) => {
    setPickedUsers((prev) => [
      ...prev,
      { user_id: user.user_id, display_name: user.display_name, role_label: user.role_label },
    ]);
    setSearchQuery('');
  };

  const removeUser = (userId: string) => {
    setPickedUsers((prev) => prev.filter((u) => u.user_id !== userId));
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen || visibleResults.length === 0) {
      if (e.key === 'Backspace' && searchQuery.length === 0 && pickedUsers.length > 0) {
        const last = pickedUsers[pickedUsers.length - 1];
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
      if (target) addUser(target);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const recipientCount = selectedRoles.size + pickedUsers.length;

  const handleSubmit = async () => {
    if (!report || recipientCount === 0) return;

    setSubmitting(true);
    try {
      const response = await apiClient<{ share_id: string; conversation_id: string }>(
        `/api/v1/reports/builder/${report.id}/share`,
        {
          method: 'POST',
          body: JSON.stringify({
            saved_report_id: report.id,
            format,
            audience: {
              user_ids: pickedUsers.map((u) => u.user_id),
              role_keys: Array.from(selectedRoles),
            },
            message_body: message.trim() ? message.trim() : undefined,
          }),
        },
      );

      toast.success(t('shareDialog.success', { count: recipientCount }));
      onOpenChange(false);
      onSuccess?.(response.share_id);
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      console.error('[ShareDialog.submit]', err);
      if (apiErr?.code === 'REPORT_SHARE_TOO_LARGE') {
        toast.error(t('shareDialog.errorTooLarge'));
      } else if (apiErr?.code === 'REPORT_SHARE_PERMISSION_DENIED') {
        toast.error(t('shareDialog.errorForbidden'));
      } else {
        toast.error(apiErr?.message ?? t('shareDialog.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormat('pdf');
    setSelectedRoles(new Set());
    setPickedUsers([]);
    setMessage('');
    setSearchQuery('');
    setSearchOpen(false);
    setSearchResults([]);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>{t('shareDialog.title', { name: report?.name ?? '' })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('shareDialog.format')}</Label>
            <div className="flex flex-wrap gap-2">
              {(['pdf', 'excel', 'word', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm transition',
                    format === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-text-primary hover:bg-background/60',
                  )}
                  data-testid={`share-format-${value}`}
                >
                  {t(`shareDialog.format_${value}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Role groups */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('shareDialog.roleGroups')}</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => {
                const active = selectedRoles.has(role.key);
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => toggleRole(role.key)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-text-secondary hover:bg-background/60',
                    )}
                    data-testid={`share-role-${role.key}`}
                    aria-pressed={active}
                  >
                    {t(role.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct recipients */}
          <div className="space-y-2">
            <Label htmlFor="share-people-search" className="text-sm font-medium">
              {t('shareDialog.directRecipients')}
            </Label>

            {pickedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pickedUsers.map((u) => (
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
                      aria-label={t('shareDialog.removeRecipient', { name: u.display_name })}
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
                id="share-people-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchOpen(false), 150);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={t('shareDialog.searchPeoplePlaceholder')}
                className="ps-9"
                autoComplete="off"
              />
              {searchOpen && (searchQuery.length > 0 || visibleResults.length > 0) && (
                <div
                  role="listbox"
                  className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
                >
                  {searchLoading && visibleResults.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-text-tertiary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('shareDialog.searching')}
                    </div>
                  ) : visibleResults.length === 0 ? (
                    <div className="p-3 text-sm text-text-tertiary">
                      {t('shareDialog.searchEmpty')}
                    </div>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto">
                      {visibleResults.map((user, idx) => (
                        <li
                          key={user.user_id}
                          role="option"
                          aria-selected={idx === highlightedIndex}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addUser(user);
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
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="share-message" className="text-sm font-medium">
              {t('shareDialog.message')}
            </Label>
            <Textarea
              id="share-message"
              placeholder={t('shareDialog.messagePlaceholder', {
                reportName: report?.name ?? '',
              })}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={3}
              className="resize-none text-base sm:text-sm"
              data-testid="share-message"
            />
            <p className="text-xs text-text-tertiary">{message.length} / 4000</p>
          </div>

          {recipientCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-text-secondary">
              <Users className="h-3.5 w-3.5" />
              {t('shareDialog.recipientSummary', { count: recipientCount })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            {t('shareDialog.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || recipientCount === 0}
            data-testid="share-submit"
          >
            {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('shareDialog.share')}
          </Button>
        </DialogFooter>

        {selectedRoles.size > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-border pt-2">
            {Array.from(selectedRoles).map((key) => {
              const role = ROLE_OPTIONS.find((r) => r.key === key);
              if (!role) return null;
              return (
                <Badge key={key} variant="secondary" className="gap-1 text-[11px]">
                  {t(role.label)}
                  <button
                    type="button"
                    onClick={() => removeRole(key)}
                    className="ms-1 rounded-full p-0.5 hover:bg-background/40"
                    aria-label={t('shareDialog.removeRole')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
