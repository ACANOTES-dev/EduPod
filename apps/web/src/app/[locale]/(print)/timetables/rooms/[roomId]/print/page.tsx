'use client';

import { Loader2, Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TimetableGrid, type TimetableEntry } from '@/components/timetable-grid';
import { apiClient } from '@/lib/api-client';

interface ListResponse<T> {
  data: T[];
}

interface RoomSummary {
  id: string;
  name: string;
}

export default function RoomPrintPage({ params }: { params: { roomId: string } }) {
  const t = useTranslations('scheduling');
  const searchParams = useSearchParams();
  const academicYearId = searchParams?.get('academic_year_id') ?? '';

  const [entries, setEntries] = React.useState<TimetableEntry[]>([]);
  const [room, setRoom] = React.useState<RoomSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!academicYearId) {
      setLoading(false);
      return;
    }

    Promise.all([
      apiClient<ListResponse<TimetableEntry>>(
        `/api/v1/timetables/room/${params.roomId}?academic_year_id=${academicYearId}`,
      ),
      apiClient<RoomSummary>(`/api/v1/rooms/${params.roomId}`).catch(() => null),
    ])
      .then(([timetable, roomInfo]) => {
        setEntries(timetable.data ?? []);
        setRoom(roomInfo);
      })
      .catch((err) => console.error('[RoomPrintPage]', err))
      .finally(() => setLoading(false));
  }, [academicYearId, params.roomId]);

  const handlePrint = () => window.print();

  // Auto-trigger print dialog once data loaded for convenience
  React.useEffect(() => {
    if (!loading && entries.length > 0) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, entries.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin me-2" />
        {t('loading')}
      </div>
    );
  }

  if (!academicYearId) {
    return <div className="p-8 text-center text-sm text-gray-600">{t('missingAcademicYear')}</div>;
  }

  const title = room ? `${t('room')}: ${room.name}` : t('roomTimetable');

  return (
    <div className="mx-auto max-w-4xl p-8 print:p-4 print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Printer className="h-4 w-4 me-2" />
          {t('print')}
        </button>
      </div>

      <TimetableGrid entries={entries} printMode title={title} />

      <p className="mt-6 text-center text-[10px] text-gray-400 print:mt-4">
        {new Date().toLocaleDateString()} · {t('generatedBy')}
      </p>
    </div>
  );
}
