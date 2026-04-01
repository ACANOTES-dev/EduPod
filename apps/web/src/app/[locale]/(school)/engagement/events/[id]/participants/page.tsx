'use client';

import { Download, BellRing } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import {
  getParticipantClassName,
  getParticipantYearGroupName,
  humanizeStatus,
  type EventParticipantRow,
  type EventRecord,
  type PaginatedResponse,
} from '../../../_components/engagement-types';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function EventParticipantsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [participants, setParticipants] = React.useState<EventParticipantRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [consentFilter, setConsentFilter] = React.useState('all');
  const [paymentFilter, setPaymentFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (consentFilter !== 'all') params.set('consent_status', consentFilter);
      if (paymentFilter !== 'all') params.set('payment_status', paymentFilter);

      const [eventResponse, participantsResponse] = await Promise.all([
        apiClient<EventRecord>(`/api/v1/engagement/events/${id}`),
        apiClient<PaginatedResponse<EventParticipantRow>>(
          `/api/v1/engagement/events/${id}/participants?${params.toString()}`,
        ),
      ]);

      setEvent(eventResponse);
      setParticipants(participantsResponse.data);
      setTotal(participantsResponse.meta.total);
    } catch (error) {
      console.error('[EventParticipantsPage.loadData]', error);
      toast.error(t('pages.eventParticipants.loadError'));
    } finally {
      setLoading(false);
    }
  }, [consentFilter, id, page, paymentFilter, statusFilter, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredParticipants = React.useMemo(() => {
    if (!search.trim()) return participants;
    const query = search.toLowerCase();
    return participants.filter((participant) =>
      `${participant.student.first_name} ${participant.student.last_name}`
        .toLowerCase()
        .includes(query),
    );
  }, [participants, search]);

  async function remindAll() {
    try {
      await apiClient(`/api/v1/engagement/events/${id}/remind-outstanding`, {
        method: 'POST',
      });
      toast.success(t('pages.eventParticipants.remindAllSuccess'));
    } catch (error) {
      console.error('[EventParticipantsPage.remindAll]', error);
      toast.error(t('pages.eventParticipants.remindAllError'));
    }
  }

  function exportParticipants() {
    downloadCsv(`event-${id}-participants.csv`, [
      [
        t('pages.eventParticipants.csvColumns.student'),
        t('pages.eventParticipants.csvColumns.yearGroup'),
        t('pages.eventParticipants.csvColumns.class'),
        t('pages.eventParticipants.csvColumns.eventStatus'),
        t('pages.eventParticipants.csvColumns.consentStatus'),
        t('pages.eventParticipants.csvColumns.paymentStatus'),
      ],
      ...filteredParticipants.map((participant) => [
        `${participant.student.first_name} ${participant.student.last_name}`,
        getParticipantYearGroupName(participant),
        getParticipantClassName(participant),
        humanizeStatus(participant.status),
        humanizeStatus(participant.consent_status),
        humanizeStatus(participant.payment_status),
      ]),
    ]);
  }

  if (!event && loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={event?.title ?? t('pages.eventParticipants.title')}
        description={t('pages.eventParticipants.description')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportParticipants}>
              <Download className="me-2 h-4 w-4" />
              {t('pages.eventParticipants.export')}
            </Button>
            <Button onClick={() => void remindAll()}>
              <BellRing className="me-2 h-4 w-4" />
              {t('pages.eventParticipants.remindAll')}
            </Button>
          </div>
        }
      />

      <DataTable
        columns={[
          {
            key: 'student',
            header: t('pages.eventParticipants.columns.student'),
            render: (row) => (
              <div>
                <p className="font-medium text-text-primary">
                  {row.student.first_name} {row.student.last_name}
                </p>
                <p className="text-xs text-text-tertiary">
                  {getParticipantYearGroupName(row)} / {getParticipantClassName(row)}
                </p>
              </div>
            ),
          },
          {
            key: 'consent',
            header: t('pages.eventParticipants.columns.consent'),
            render: (row) => humanizeStatus(row.consent_status),
          },
          {
            key: 'payment',
            header: t('pages.eventParticipants.columns.payment'),
            render: (row) => humanizeStatus(row.payment_status),
          },
          {
            key: 'attendance',
            header: t('pages.eventParticipants.columns.attendance'),
            render: (row) =>
              humanizeStatus(
                row.status === 'attended'
                  ? 'attended'
                  : row.status === 'absent'
                    ? 'absent'
                    : 'pending',
              ),
          },
          {
            key: 'actions',
            header: t('pages.eventParticipants.columns.actions'),
            render: () => (
              <Button
                variant="ghost"
                size="sm"
                onClick={(eventObject) => {
                  eventObject.stopPropagation();
                  toast.message(t('pages.eventParticipants.individualReminderNote'));
                  void remindAll();
                }}
              >
                {t('pages.eventParticipants.remind')}
              </Button>
            ),
          },
        ]}
        data={filteredParticipants}
        page={page}
        pageSize={20}
        total={search ? filteredParticipants.length : total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        toolbar={
          <div className="grid gap-3 lg:grid-cols-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('shared.searchStudents')}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allStatuses')}</SelectItem>
                {['invited', 'registered', 'confirmed', 'attended', 'absent', 'withdrawn'].map(
                  (status) => (
                    <SelectItem key={status} value={status}>
                      {humanizeStatus(status)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select value={consentFilter} onValueChange={setConsentFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allConsent')}</SelectItem>
                {['pending', 'granted', 'declined'].map((status) => (
                  <SelectItem key={status} value={status}>
                    {humanizeStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('shared.allPayments')}</SelectItem>
                {['pending', 'paid', 'waived', 'not_required'].map((status) => (
                  <SelectItem key={status} value={status}>
                    {humanizeStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  );
}
