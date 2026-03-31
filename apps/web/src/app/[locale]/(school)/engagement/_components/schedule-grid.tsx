'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';

import {
  formatDisplayTimeRange,
  type ConferenceStatsPerTeacher,
  type ConferenceTimeSlotRecord,
} from './engagement-types';

interface ScheduleGridTeacher {
  id: string;
  name: string;
}

interface ScheduleGridProps {
  locale: string;
  onSelectSlot?: (slot: ConferenceTimeSlotRecord) => void;
  selectedSlotId?: string | null;
  slots: ConferenceTimeSlotRecord[];
  stats?: ConferenceStatsPerTeacher[];
  teachers: ScheduleGridTeacher[];
}

function getSlotTone(slot: ConferenceTimeSlotRecord) {
  if (slot.status === 'booked') {
    return 'border-sky-200 bg-sky-50 text-sky-900';
  }

  if (slot.status === 'blocked') {
    return 'border-slate-200 bg-slate-100 text-slate-600';
  }

  if (slot.status === 'completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }

  if (slot.status === 'cancelled') {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-900';
}

function getSlotLabel(
  slot: ConferenceTimeSlotRecord,
  t: ReturnType<typeof useTranslations<'engagement'>>,
) {
  if (slot.booking) {
    return `${slot.booking.student.first_name} ${slot.booking.student.last_name}`;
  }

  if (slot.status === 'blocked') {
    return t('conferenceSchedule.blocked');
  }

  if (slot.status === 'completed') {
    return t('conferenceSchedule.completed');
  }

  if (slot.status === 'cancelled') {
    return t('conferenceSchedule.cancelled');
  }

  return t('conferenceSchedule.available');
}

export function ScheduleGrid({
  locale,
  onSelectSlot,
  selectedSlotId,
  slots,
  stats,
  teachers,
}: ScheduleGridProps) {
  const t = useTranslations('engagement');

  const slotTimes = Array.from(
    new Set(slots.map((slot) => `${slot.start_time}|${slot.end_time}`)),
  ).sort((left, right) => left.localeCompare(right));

  const slotLookup = new Map(
    slots.map((slot) => [`${slot.teacher_id}|${slot.start_time}|${slot.end_time}`, slot]),
  );
  const statLookup = new Map((stats ?? []).map((entry) => [entry.teacher_id, entry]));

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[840px]"
          style={{ gridTemplateColumns: `220px repeat(${teachers.length}, minmax(180px, 1fr))` }}
        >
          <div className="sticky start-0 top-0 z-30 border-b border-e border-border bg-surface px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
              {t('conferenceSchedule.time')}
            </p>
          </div>
          {teachers.map((teacher) => {
            const teacherStats = statLookup.get(teacher.id);

            return (
              <div
                key={teacher.id}
                className="sticky top-0 z-20 border-b border-border bg-surface px-4 py-4"
              >
                <p className="font-semibold text-text-primary">{teacher.name}</p>
                {teacherStats ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    {t('conferenceSchedule.bookedStat', {
                      booked: teacherStats.booked,
                      total: teacherStats.total,
                    })}
                  </p>
                ) : null}
              </div>
            );
          })}

          {slotTimes.map((slotTime) => {
            const [startTime, endTime] = slotTime.split('|');

            return (
              <div key={slotTime} className="contents">
                <div className="sticky start-0 z-10 border-e border-t border-border bg-surface px-4 py-4">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDisplayTimeRange(startTime, endTime, locale)}
                  </p>
                </div>
                {teachers.map((teacher) => {
                  const slot = slotLookup.get(`${teacher.id}|${startTime}|${endTime}`);

                  if (!slot) {
                    return (
                      <div
                        key={`${teacher.id}-${slotTime}`}
                        className="border-t border-border bg-surface-secondary/30 px-3 py-4"
                      />
                    );
                  }

                  const isSelected = selectedSlotId === slot.id;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => onSelectSlot?.(slot)}
                      className={`border-t border-border px-3 py-4 text-start transition-colors hover:bg-surface-secondary ${
                        isSelected ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div
                        className={`min-h-[88px] rounded-2xl border p-3 ${getSlotTone(slot)} ${
                          isSelected ? 'ring-2 ring-primary-300' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">{getSlotLabel(slot, t)}</p>
                          <Badge
                            variant="secondary"
                            className="rounded-full border border-current/20 bg-white/70"
                          >
                            {t(`conferenceSchedule.statuses.${slot.status}`)}
                          </Badge>
                        </div>
                        {slot.booking ? (
                          <p className="mt-2 text-xs text-current/80">
                            {t('conferenceSchedule.bookingType', {
                              type: t(
                                `conferenceSchedule.bookingTypes.${slot.booking.booking_type}`,
                              ),
                            })}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
