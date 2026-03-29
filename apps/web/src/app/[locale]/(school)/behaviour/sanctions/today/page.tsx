'use client';

import {
  Badge,
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { AlertTriangle, CalendarDays, CheckCircle, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodaySanction {
  id: string;
  sanction_number: string;
  type: string;
  status: string;
  scheduled_date: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  notes: string | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  supervised_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  scheduled_room: {
    id: string;
    name: string;
  } | null;
}

interface TodayResponse {
  data: Record<string, TodaySanction[]>;
  total: number;
}

interface BulkMarkResponse {
  succeeded: Array<{ id: string; sanction_number: string }>;
  failed: Array<{ id: string; reason: string }>;
}

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'served' },
  { value: 'no_show' },
  { value: 'partially_served' },
  { value: 'excused' },
] as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  served: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  partially_served: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  excused: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  appealed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTodayDate(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayName = days[d.getDay()] ?? '';
  const month = months[d.getMonth()] ?? '';
  return `${dayName}, ${d.getDate()} ${month} ${d.getFullYear()}`;
}

/**
 * Group sanctions by room, then by time slot within each room.
 * Sanctions without a room go into "Unassigned Room".
 */
function groupByRoomAndTime(
  sanctions: TodaySanction[],
): Array<{
  room: string;
  timeSlots: Array<{
    time: string;
    sanctions: TodaySanction[];
  }>;
}> {
  const roomMap = new Map<string, TodaySanction[]>();

  for (const s of sanctions) {
    const roomKey = s.scheduled_room?.name ?? 'Unassigned Room';
    const existing = roomMap.get(roomKey);
    if (existing) {
      existing.push(s);
    } else {
      roomMap.set(roomKey, [s]);
    }
  }

  const result: Array<{
    room: string;
    timeSlots: Array<{ time: string; sanctions: TodaySanction[] }>;
  }> = [];

  for (const [room, roomSanctions] of roomMap.entries()) {
    const timeMap = new Map<string, TodaySanction[]>();

    for (const s of roomSanctions) {
      const start = formatTime(s.scheduled_start_time);
      const end = formatTime(s.scheduled_end_time);
      const timeKey = start && end ? `${start} - ${end}` : start || 'No time set';
      const existing = timeMap.get(timeKey);
      if (existing) {
        existing.push(s);
      } else {
        timeMap.set(timeKey, [s]);
      }
    }

    const timeSlots: Array<{ time: string; sanctions: TodaySanction[] }> = [];
    for (const [time, timeSanctions] of timeMap.entries()) {
      timeSlots.push({ time, sanctions: timeSanctions });
    }
    // Sort time slots chronologically
    timeSlots.sort((a, b) => a.time.localeCompare(b.time));

    result.push({ room, timeSlots });
  }

  // Sort rooms alphabetically, but "Unassigned Room" last
  result.sort((a, b) => {
    if (a.room === 'Unassigned Room') return 1;
    if (b.room === 'Unassigned Room') return -1;
    return a.room.localeCompare(b.room);
  });

  return result;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TodaySanctionsPage() {
  const t = useTranslations('behaviour.sanctionsToday');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [allSanctions, setAllSanctions] = React.useState<TodaySanction[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = React.useState<string | null>(null);
  const [bulkMarking, setBulkMarking] = React.useState(false);

  // Fetch today's sanctions
  const fetchToday = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient<TodayResponse>('/api/v1/behaviour/sanctions/today');
      // Flatten the grouped data into a single array
      const flat: TodaySanction[] = [];
      if (res.data && typeof res.data === 'object') {
        for (const group of Object.values(res.data)) {
          if (Array.isArray(group)) {
            flat.push(...group);
          }
        }
      }
      setAllSanctions(flat);
    } catch {
      setError('Failed to load today\u2019s sanctions');
      setAllSanctions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchToday();
  }, [fetchToday]);

  // Computed stats
  const totalScheduled = allSanctions.filter((s) => s.status === 'scheduled').length;
  const totalServed = allSanctions.filter((s) => s.status === 'served').length;
  const totalNoShow = allSanctions.filter((s) => s.status === 'no_show').length;
  const grouped = groupByRoomAndTime(allSanctions);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const scheduledIds = allSanctions
      .filter((s) => s.status === 'scheduled')
      .map((s) => s.id);
    if (scheduledIds.length === 0) return;

    const allSelected = scheduledIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(scheduledIds));
    }
  };

  // Update single status
  const handleStatusChange = async (sanctionId: string, newStatus: string) => {
    setUpdatingStatus(sanctionId);
    try {
      await apiClient(`/api/v1/behaviour/sanctions/${sanctionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      void fetchToday();
      // Remove from selection if it was selected
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(sanctionId);
        return next;
      });
    } catch {
      // Error toast handled by apiClient
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Bulk mark served
  const handleBulkMarkServed = async () => {
    if (selected.size === 0) return;
    setBulkMarking(true);
    try {
      await apiClient<BulkMarkResponse>('/api/v1/behaviour/sanctions/bulk-mark-served', {
        method: 'POST',
        body: JSON.stringify({ sanction_ids: Array.from(selected) }),
      });
      setSelected(new Set());
      void fetchToday();
    } catch {
      // Error toast handled by apiClient
    } finally {
      setBulkMarking(false);
    }
  };

  // ─── Loading state ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-surface-secondary"
            />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-surface-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="rounded-xl border border-red-200 bg-red-50 py-12 text-center dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void fetchToday()}
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────

  if (allSanctions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('title')}
          description={formatTodayDate()}
          actions={
            <Link href={`/${locale}/behaviour/sanctions`}>
              <Button variant="outline">{t('allSanctions')}</Button>
            </Link>
          }
        />
        <div className="rounded-xl border border-border bg-surface py-16 text-center dark:bg-surface">
          <CalendarDays className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm font-medium text-text-primary">
            {t('empty')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('emptyDescription')}
          </p>
        </div>
      </div>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────────

  const scheduledIds = allSanctions.filter((s) => s.status === 'scheduled').map((s) => s.id);
  const allScheduledSelected =
    scheduledIds.length > 0 && scheduledIds.every((id) => selected.has(id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t('title')}
        description={formatTodayDate()}
        actions={
          <Link href={`/${locale}/behaviour/sanctions`}>
            <Button variant="outline">{t('allSanctions')}</Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 dark:bg-surface">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-text-tertiary" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('stats.total')}
            </span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {allSanctions.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 dark:bg-surface">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('stats.scheduled')}
            </span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {totalScheduled}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 dark:bg-surface">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('stats.served')}
            </span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {totalServed}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 dark:bg-surface">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('stats.noShow')}
            </span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {totalNoShow}
            {totalNoShow > 0 && (
              <span className="ms-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {totalNoShow}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {scheduledIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-secondary p-3 dark:bg-surface-secondary">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allScheduledSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all scheduled sanctions"
            />
            <span className="text-sm text-text-secondary">
              {selected.size > 0
                ? t('selectedCount', { count: selected.size })
                : t('selectAllScheduled')}
            </span>
          </div>
          {selected.size > 0 && (
            <Button
              size="sm"
              disabled={bulkMarking}
              onClick={() => void handleBulkMarkServed()}
            >
              <CheckCircle className="me-1 h-3.5 w-3.5" />
              {bulkMarking
                ? t('marking')
                : t('markAsServed', { count: selected.size })}
            </Button>
          )}
        </div>
      )}

      {/* Grouped by Room then Time */}
      <div className="space-y-6">
        {grouped.map((roomGroup) => (
          <div key={roomGroup.room}>
            {/* Room Header */}
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">
                {roomGroup.room}
              </h2>
              <Badge variant="secondary" className="text-xs">
                {roomGroup.timeSlots.reduce(
                  (acc, ts) => acc + ts.sanctions.length,
                  0,
                )}{' '}
                {t('sanctionsCount')}
              </Badge>
            </div>

            <div className="space-y-4">
              {roomGroup.timeSlots.map((timeSlot) => (
                <div
                  key={`${roomGroup.room}-${timeSlot.time}`}
                  className="rounded-xl border border-border bg-surface dark:bg-surface"
                >
                  {/* Time Slot Header */}
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <Clock className="h-4 w-4 text-text-tertiary" />
                    <span className="text-sm font-medium text-text-primary">
                      {timeSlot.time}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {timeSlot.sanctions.length}
                    </Badge>
                  </div>

                  {/* Sanctions List */}
                  <div className="divide-y divide-border">
                    {timeSlot.sanctions.map((sanction) => (
                      <SanctionRow
                        key={sanction.id}
                        sanction={sanction}
                        isSelected={selected.has(sanction.id)}
                        onToggleSelect={() => toggleSelect(sanction.id)}
                        onStatusChange={(status) =>
                          handleStatusChange(sanction.id, status)
                        }
                        isUpdating={updatingStatus === sanction.id}
                        locale={locale}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sanction Row Component ───────────────────────────────────────────────────

interface SanctionRowProps {
  sanction: TodaySanction;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: string) => void;
  isUpdating: boolean;
  locale: string;
}

function SanctionRow({
  sanction,
  isSelected,
  onToggleSelect,
  onStatusChange,
  isUpdating,
  locale,
}: SanctionRowProps) {
  const t = useTranslations('behaviour.sanctionsToday');
  const isScheduled = sanction.status === 'scheduled';
  const studentName = sanction.student
    ? `${sanction.student.first_name} ${sanction.student.last_name}`
    : t('unknownStudent');

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Checkbox (only for scheduled) */}
      <div className="shrink-0">
        {isScheduled ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${studentName}`}
          />
        ) : (
          <div className="h-4 w-4" />
        )}
      </div>

      {/* Student info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/behaviour/students/${sanction.student?.id ?? ''}`}
            className="truncate text-sm font-medium text-text-primary hover:text-primary-600 hover:underline"
          >
            {studentName}
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_BADGE_CLASSES[sanction.status] ??
              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {t(`statuses.${sanction.status}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          <span>{t(`types.${sanction.type}` as Parameters<typeof t>[0])}</span>
          {sanction.notes && (
            <>
              <span className="text-border">{'\u2022'}</span>
              <span className="max-w-[200px] truncate">{sanction.notes}</span>
            </>
          )}
        </div>
      </div>

      {/* Status control */}
      <div className="shrink-0">
        {isScheduled ? (
          <Select
            value=""
            onValueChange={(v) => onStatusChange(v)}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-36 text-sm">
              <SelectValue placeholder={isUpdating ? t('updating') : t('setStatus')} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(`statusOptions.${opt.value}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_BADGE_CLASSES[sanction.status] ??
              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {t(`statuses.${sanction.status}` as Parameters<typeof t>[0])}
          </span>
        )}
      </div>
    </div>
  );
}
