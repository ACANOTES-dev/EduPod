'use client';

import { ArrowLeft, Edit } from 'lucide-react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { RecordHub } from '@/components/record-hub';
import { TimetableGrid } from '@/components/timetable-grid';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomDetail {
  id: string;
  name: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
  active: boolean;
}

interface TimetableEntry {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_name: string;
  room_name?: string;
  teacher_name?: string;
  subject_name?: string;
}

interface TimetableResponse {
  data: TimetableEntry[];
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ room }: { room: RoomDetail }) {
  const t = useTranslations('scheduling');
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-text-tertiary">{t('roomType')}</dt>
          <dd className="mt-0.5 text-sm capitalize text-text-primary">{room.room_type}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('capacity')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{room.capacity ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('exclusive')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">{room.is_exclusive ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('active')}</dt>
          <dd className="mt-0.5 text-sm text-text-primary">
            {room.active ? 'Active' : 'Inactive'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Timetable Tab ────────────────────────────────────────────────────────────

function TimetableTab({ roomId }: { roomId: string }) {
  const [entries, setEntries] = React.useState<TimetableEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<TimetableResponse>(`/api/v1/timetables/room/${roomId}`)
      .then((res) => setEntries(res.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [roomId]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />;
  }

  return <TimetableGrid entries={entries} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [room, setRoom] = React.useState<RoomDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: RoomDetail }>(`/api/v1/rooms/${id}`)
      .then((res) => setRoom(res.data))
      .catch(() => setError('Failed to load room'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || 'Room not found'}</p>
      </div>
    );
  }

  const tabs = [
    {
      key: 'overview',
      label: t('room'),
      content: <OverviewTab room={room} />,
    },
    {
      key: 'timetable',
      label: t('timetables'),
      content: <TimetableTab roomId={id} />,
    },
  ];

  return (
    <RecordHub
      title={room.name}
      subtitle={room.room_type}
      status={{
        label: room.active ? 'Active' : 'Inactive',
        variant: room.active ? 'success' : 'neutral',
      }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
          <Button onClick={() => router.push(`/${locale}/rooms/${id}/edit`)}>
            <Edit className="me-2 h-4 w-4" />
            {tc('edit')}
          </Button>
        </div>
      }
      metrics={[
        { label: t('roomType'), value: room.room_type },
        { label: t('capacity'), value: room.capacity ?? '—' },
      ]}
      tabs={tabs}
    />
  );
}
