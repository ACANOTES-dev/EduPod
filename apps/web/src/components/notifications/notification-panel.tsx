'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface NotificationItem {
  id: string;
  channel: string;
  template_key: string | null;
  status: string;
  payload_json: Record<string, unknown>;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: string;
  read_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function groupNotifications(notifications: NotificationItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayGroup: { label: string; items: NotificationItem[] } = { label: 'Today', items: [] };
  const yesterdayGroup: { label: string; items: NotificationItem[] } = {
    label: 'Yesterday',
    items: [],
  };
  const earlierGroup: { label: string; items: NotificationItem[] } = {
    label: 'Earlier',
    items: [],
  };

  for (const n of notifications) {
    const date = new Date(n.created_at);
    if (date >= today) {
      todayGroup.items.push(n);
    } else if (date >= yesterday) {
      yesterdayGroup.items.push(n);
    } else {
      earlierGroup.items.push(n);
    }
  }

  return [todayGroup, yesterdayGroup, earlierGroup].filter((g) => g.items.length > 0);
}

function getNotificationTitle(n: NotificationItem): string {
  const p = n.payload_json;
  switch (n.template_key) {
    case 'announcement.published':
      return `New announcement: ${String(p.announcement_title ?? 'Untitled')}`;
    case 'inquiry.new_message':
      return `New inquiry message${p.inquiry_subject ? `: ${String(p.inquiry_subject)}` : ''}`;
    case 'approval.requested':
      return 'New approval request';
    case 'approval.decided':
      return 'Approval decision made';
    // Leave & Cover
    case 'absence.self_reported_confirmation':
      return 'Absence reported';
    case 'absence.admin_notice':
      return `${String(p.reporter_name ?? 'A teacher')} is absent`;
    case 'absence.cancelled':
      return `${String(p.reporter_name ?? 'A teacher')}'s absence was cancelled`;
    case 'substitution.offer_received':
      return `Cover request: ${String(p.reporter_name ?? 'a colleague')}`;
    case 'substitution.offer_nominated':
      return `${String(p.reporter_name ?? 'A colleague')} asked you to cover`;
    case 'substitution.admin_offer_dispatched':
      return `${String(p.offers_count ?? '')} cover offer(s) sent`;
    case 'substitution.accepted':
      return `Cover confirmed: ${String(p.substitute_name ?? '')}`;
    case 'substitution.declined':
      return `Cover offer declined`;
    case 'substitution.cascade_exhausted':
      return `Manual cover needed for ${String(p.reporter_name ?? 'an absence')}`;
    case 'substitution.offer_revoked':
      return 'Cover offer no longer needed';
    case 'substitution.nominated_rejected':
      return `Nominated cover declined`;
    case 'leave.request_submitted':
      return `Leave request: ${String(p.requester_name ?? 'a teacher')}`;
    case 'leave.request_approved':
      return 'Your leave was approved';
    case 'leave.request_rejected':
      return 'Your leave was rejected';
    default:
      return n.template_key ?? 'Notification';
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function NotificationPanel() {
  const nt = useTranslations('notifications');
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- Data fetching ---- */

  const fetchUnreadCount = useCallback(async () => {
    try {
      const result = await apiClient<{ data: { count: number } }>(
        '/api/v1/notifications/unread-count',
        { silent: true },
      );
      setUnreadCount(result.data.count);
    } catch (err) {
      console.error('[NotificationPanel.fetchUnreadCount]', err);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient<{ data: NotificationItem[] }>(
        '/api/v1/notifications?pageSize=20',
        { silent: true },
      );
      setNotifications(result.data);
    } catch (err) {
      console.error('[NotificationPanel.fetchNotifications]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---- Polling for unread count ---- */
  useEffect(() => {
    void fetchUnreadCount();
    const interval = setInterval(() => void fetchUnreadCount(), 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  /* ---- Fetch list when panel opens ---- */
  useEffect(() => {
    if (isOpen) void fetchNotifications();
  }, [isOpen, fetchNotifications]);

  /* ---- Close on outside click ---- */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  /* ---- Actions ---- */

  const handleMarkAllRead = async () => {
    try {
      await apiClient('/api/v1/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read', read_at: new Date().toISOString() })),
      );
    } catch (err) {
      console.error('[NotificationPanel.handleMarkAllRead]', err);
    }
  };

  const handleMarkRead = async (id: string) => {
    // Only call API if currently unread
    const item = notifications.find((n) => n.id === id);
    if (!item || item.status === 'read') return;

    try {
      await apiClient(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, status: 'read', read_at: new Date().toISOString() } : n,
        ),
      );
    } catch (err) {
      console.error('[NotificationPanel.handleMarkRead]', err);
    }
  };

  const groups = groupNotifications(notifications);

  /* -------------------------------------------------------------------------- */
  /* Render                                                                      */
  /* -------------------------------------------------------------------------- */

  return (
    <div ref={panelRef} className="relative">
      {/* Bell trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-2 text-text-secondary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-label={nt('title')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread`}
            className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={nt('title')}
          className="absolute end-0 top-full z-50 mt-2 w-80 max-h-[480px] overflow-y-auto rounded-2xl border border-border bg-surface shadow-lg"
        >
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-border bg-surface px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{nt('title')}</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                {nt('markAllRead')}
              </button>
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-sm text-text-tertiary">{nt('empty')}</p>
            </div>
          ) : (
            <div className="py-2">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {group.label}
                  </p>
                  {group.items.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleMarkRead(n.id)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-start transition-colors hover:bg-surface-secondary"
                    >
                      {/* Unread indicator dot */}
                      <div className="mt-1.5 shrink-0">
                        {n.status !== 'read' ? (
                          <div className="h-2 w-2 rounded-full bg-primary-500" />
                        ) : (
                          <div className="h-2 w-2" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            n.status !== 'read'
                              ? 'font-semibold text-text-primary'
                              : 'font-normal text-text-secondary'
                          }`}
                        >
                          {getNotificationTitle(n)}
                        </p>
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {formatRelativeTime(n.created_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
