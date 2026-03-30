'use client';

import * as React from 'react';

import { DiaryEventCard } from './diary-event-card';
import { DiaryHomeworkSection } from './diary-homework-section';
import { DiaryPersonalNote } from './diary-personal-note';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiaryDayViewProps {
  studentId: string;
  classId: string | null;
  selectedDate: string; // YYYY-MM-DD
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiaryDayView({ studentId, classId, selectedDate }: DiaryDayViewProps) {
  return (
    <div className="space-y-6">
      <DiaryHomeworkSection classId={classId} date={selectedDate} />
      <DiaryEventCard date={selectedDate} />
      <DiaryPersonalNote studentId={studentId} date={selectedDate} />
    </div>
  );
}
