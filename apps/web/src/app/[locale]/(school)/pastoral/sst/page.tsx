'use client';

import { CalendarPlus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import {
  getLocaleFromPathname,
  normalizeMeetingStatus,
  SST_MEETING_STATUSES,
  type PastoralApiListResponse,
  type SstMeetingListItem,
} from '@/lib/pastoral';

const PAGE_SIZE = 20;

function toLocalDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function SstMeetingsPage() {
  const t = useTranslations('pastoral.sst');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [meetings, setMeetings] = React.useState<SstMeetingListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState('all');
  const [scheduledAt, setScheduledAt] = React.useState(() => toLocalDateTimeValue(new Date()));
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState('');

  const fetchMeetings = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (status !== 'all') {
        params.set('status', status);
      }

      const response = await apiClient<PastoralApiListResponse<SstMeetingListItem>>(
        `/api/v1/pastoral/sst/meetings?${params.toString()}`,
        { silent: true },
      );

      setMeetings(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch {
      setMeetings([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, status]);

  React.useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  const createMeeting = async () => {
    setError('');
    setIsCreating(true);

    try {
      const response = await apiClient<{ id?: string; data: { id: string } }>(
        '/api/v1/pastoral/sst/meetings',
        {
          method: 'POST',
          body: JSON.stringify({ scheduled_at: new Date(scheduledAt).toISOString() }),
        },
      );

      router.push(`/${locale}/pastoral/sst/${response.data.id}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const columns = [
    {
      key: 'scheduled_at',
      header: t('columns.scheduledAt'),
      render: (row: SstMeetingListItem) => (
        <span className="font-medium text-text-primary">{formatDateTime(row.scheduled_at)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: SstMeetingListItem) => (
        <span className="text-sm text-text-secondary">
          {t(`status.${normalizeMeetingStatus(row.status)}` as never)}
        </span>
      ),
    },
    {
      key: 'attendees',
      header: t('columns.attendees'),
      render: (row: SstMeetingListItem) => (
        <span className="text-sm text-text-secondary">{row.attendees?.length ?? 0}</span>
      ),
    },
    {
      key: 'agenda_precomputed_at',
      header: t('columns.precomputed'),
      render: (row: SstMeetingListItem) => (
        <span className="text-sm text-text-secondary">
          {row.agenda_precomputed_at
            ? formatDateTime(row.agenda_precomputed_at)
            : t('notPrecomputed')}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          {SST_MEETING_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`status.${option}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-2">
        <Label htmlFor="scheduled_at">{t('scheduleMeeting')}</Label>
        <Input
          id="scheduled_at"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
      </div>

      <div className="flex items-end">
        <Button onClick={() => void createMeeting()} disabled={isCreating}>
          <CalendarPlus className="me-2 h-4 w-4" />
          {isCreating ? t('creating') : t('createMeeting')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={meetings}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/${locale}/pastoral/sst/${row.id}`)}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />
    </div>
  );
}
