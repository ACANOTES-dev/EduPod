'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@school/ui';

import { formatDisplayTimeRange, type ConferenceTimeSlotRecord } from './engagement-types';

interface SlotPickerProps {
  locale: string;
  selectedSlotId?: string | null;
  slots: ConferenceTimeSlotRecord[];
  teacherLabel: string;
  warningBySlotId?: Record<string, string>;
  onSelectSlot: (slot: ConferenceTimeSlotRecord) => void;
}

export function SlotPicker({
  locale,
  selectedSlotId,
  slots,
  teacherLabel,
  warningBySlotId,
  onSelectSlot,
}: SlotPickerProps) {
  const t = useTranslations('engagement');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{teacherLabel}</p>
          <p className="text-xs text-text-secondary">
            {t('parentConferenceBooking.availableSlotsCount', { count: slots.length })}
          </p>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/50 px-4 py-5 text-sm text-text-secondary">
          {t('parentConferenceBooking.noSlots')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {slots.map((slot) => {
            const isSelected = selectedSlotId === slot.id;
            const warning = warningBySlotId?.[slot.id];

            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelectSlot(slot)}
                className={`rounded-2xl border p-4 text-start transition-colors ${
                  isSelected
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-border bg-surface hover:border-primary-200 hover:bg-primary-50/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">
                    {formatDisplayTimeRange(slot.start_time, slot.end_time, locale)}
                  </p>
                  {isSelected ? (
                    <Badge className="rounded-full bg-primary-600 text-white">
                      {t('parentConferenceBooking.selected')}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {t('parentConferenceBooking.tapToSelect')}
                </p>
                {warning ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {warning}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
