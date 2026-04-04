'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiaryDateNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  locale: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d, 12); // noon to avoid DST issues
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiaryDateNavigator({
  selectedDate,
  onDateChange,
  locale,
}: DiaryDateNavigatorProps) {
  const t = useTranslations('diary');

  const current = parseDate(selectedDate);

  const formatted = current.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  function shiftDay(offset: number) {
    const next = new Date(current);
    next.setDate(next.getDate() + offset);
    onDateChange(toISO(next));
  }

  const isToday = selectedDate === toISO(new Date());

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} aria-label={t('previousDay')}>
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
      </Button>

      <span className="min-w-0 px-2 text-center text-sm font-medium sm:text-base">{formatted}</span>

      <Button variant="outline" size="icon" onClick={() => shiftDay(1)} aria-label={t('nextDay')}>
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </Button>

      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onDateChange(toISO(new Date()))}>
          {t('today')}
        </Button>
      )}
    </div>
  );
}
