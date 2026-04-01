'use client';

import { RotateCw, Save } from 'lucide-react';
import { useParams } from 'next/navigation';
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
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  normalizeMeetingStatus,
  searchStaff,
  searchStudents,
  type PastoralApiDetailResponse,
  type SearchOption,
  type SstAgendaItem,
  type SstMeetingDetail,
} from '@/lib/pastoral';

export default function SstMeetingDetailPage() {
  const t = useTranslations('pastoral.sstDetail');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const meetingId = params?.id as string;
  const [meeting, setMeeting] = React.useState<SstMeetingDetail | null>(null);
  const [manualItemDescription, setManualItemDescription] = React.useState('');
  const [manualStudent, setManualStudent] = React.useState<SearchOption[]>([]);
  const [actionDescription, setActionDescription] = React.useState('');
  const [assignedTo, setAssignedTo] = React.useState<SearchOption[]>([]);
  const [dueDate, setDueDate] = React.useState('');
  const [agendaItemId, setAgendaItemId] = React.useState('none');
  const [generalNotes, setGeneralNotes] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');

  const loadMeeting = React.useCallback(async () => {
    const response = await apiClient<PastoralApiDetailResponse<SstMeetingDetail>>(
      `/api/v1/pastoral/sst/meetings/${meetingId}`,
      { silent: true },
    );

    setMeeting(response.data);
    setGeneralNotes(response.data.general_notes ?? '');
    return response.data;
  }, [meetingId]);

  React.useEffect(() => {
    void loadMeeting().catch(() => {
      setMeeting(null);
    });
  }, [loadMeeting]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);

    try {
      await action();
      await loadMeeting();
      setManualItemDescription('');
      setManualStudent([]);
      setActionDescription('');
      setAssignedTo([]);
      setDueDate('');
      setAgendaItemId('none');
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  if (!meeting) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const displayStatus = normalizeMeetingStatus(meeting.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { date: formatDateTime(meeting.scheduled_at) })}
        description={t('description', { status: t(`status.${displayStatus}` as never) })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busyAction === 'refresh'}
              onClick={() =>
                void runAction('refresh', async () => {
                  await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}/agenda/refresh`, {
                    method: 'POST',
                    silent: true,
                  });
                })
              }
            >
              <RotateCw className="me-2 h-4 w-4" />
              {t('refreshAgenda')}
            </Button>
            {displayStatus === 'scheduled' ? (
              <Button
                onClick={() =>
                  void runAction('start', async () => {
                    await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}/start`, {
                      method: 'PATCH',
                      silent: true,
                    });
                  })
                }
              >
                {t('startMeeting')}
              </Button>
            ) : null}
            {displayStatus === 'in_progress' ? (
              <Button
                onClick={() =>
                  void runAction('complete', async () => {
                    await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}/complete`, {
                      method: 'PATCH',
                      silent: true,
                    });
                  })
                }
              >
                {t('completeMeeting')}
              </Button>
            ) : null}
          </div>
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('statusLabel')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {t(`status.${displayStatus}` as never)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('attendees')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {meeting.attendees?.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('agendaPrecomputed')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {meeting.agenda_precomputed_at
                ? formatDateTime(meeting.agenda_precomputed_at)
                : t('notPrecomputed')}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('agendaTitle')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('agendaDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {meeting.agenda_items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('emptyAgenda')}
                </p>
              ) : (
                meeting.agenda_items.map((item) => (
                  <AgendaItemEditor
                    key={item.id}
                    item={item}
                    t={t}
                    busy={busyAction === `agenda-${item.id}`}
                    onSave={(discussion_notes, decisions) =>
                      runAction(`agenda-${item.id}`, async () => {
                        await apiClient(
                          `/api/v1/pastoral/sst/meetings/${meeting.id}/agenda/${item.id}`,
                          {
                            method: 'PATCH',
                            body: JSON.stringify({ discussion_notes, decisions }),
                            silent: true,
                          },
                        );
                      })
                    }
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('actionsTitle')}</h2>
            <div className="mt-4 space-y-3">
              {meeting.actions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('emptyActions')}
                </p>
              ) : (
                meeting.actions.map((action) => (
                  <div key={action.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {action.description}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('actionMeta', {
                            due: formatDate(action.due_date),
                            status: t(`actionStatus.${action.status}` as never),
                          })}
                        </p>
                      </div>
                      {action.status !== 'completed' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyAction === `complete-action-${action.id}`}
                          onClick={() =>
                            void runAction(`complete-action-${action.id}`, async () => {
                              await apiClient(
                                `/api/v1/pastoral/sst/actions/${action.id}/complete`,
                                {
                                  method: 'PATCH',
                                  silent: true,
                                },
                              );
                            })
                          }
                        >
                          {t('completeAction')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('manualAgendaTitle')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual_description">{t('manualAgendaDescription')}</Label>
                <Textarea
                  id="manual_description"
                  value={manualItemDescription}
                  onChange={(event) => setManualItemDescription(event.target.value)}
                  rows={4}
                  placeholder={t('manualAgendaPlaceholder')}
                />
              </div>
              <SearchPicker
                label={t('manualAgendaStudent')}
                placeholder={t('manualAgendaStudentPlaceholder')}
                search={searchStudents}
                selected={manualStudent}
                onChange={(next) => setManualStudent(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
              />
              <Button
                className="w-full"
                disabled={!manualItemDescription.trim() || busyAction === 'manual-agenda'}
                onClick={() =>
                  void runAction('manual-agenda', async () => {
                    await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}/agenda`, {
                      method: 'POST',
                      body: JSON.stringify({
                        description: manualItemDescription.trim(),
                        student_id: manualStudent[0]?.id,
                      }),
                      silent: true,
                    });
                  })
                }
              >
                {t('addAgendaItem')}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('meetingActionsTitle')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="action_description">{t('meetingActionDescription')}</Label>
                <Textarea
                  id="action_description"
                  value={actionDescription}
                  onChange={(event) => setActionDescription(event.target.value)}
                  rows={3}
                  placeholder={t('meetingActionPlaceholder')}
                />
              </div>

              <SearchPicker
                label={t('meetingActionOwner')}
                placeholder={t('meetingActionOwnerPlaceholder')}
                search={searchStaff}
                selected={assignedTo}
                onChange={(next) => setAssignedTo(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStaff')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              <div className="space-y-2">
                <Label>{t('meetingActionAgendaItem')}</Label>
                <Select value={agendaItemId} onValueChange={setAgendaItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('meetingActionAgendaItemPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('meetingActionNoAgendaItem')}</SelectItem>
                    {meeting.agenda_items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">{t('meetingActionDueDate')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <Button
                className="w-full"
                disabled={
                  !actionDescription.trim() ||
                  !assignedTo[0] ||
                  !dueDate ||
                  busyAction === 'create-action'
                }
                onClick={() =>
                  void runAction('create-action', async () => {
                    await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}/actions`, {
                      method: 'POST',
                      body: JSON.stringify({
                        agenda_item_id: agendaItemId === 'none' ? undefined : agendaItemId,
                        description: actionDescription.trim(),
                        assigned_to_user_id: assignedTo[0]?.id,
                        due_date: dueDate,
                      }),
                      silent: true,
                    });
                  })
                }
              >
                {t('createAction')}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('notesTitle')}</h2>
            <div className="mt-4 space-y-4">
              <Textarea
                value={generalNotes}
                onChange={(event) => setGeneralNotes(event.target.value)}
                rows={6}
                placeholder={t('notesPlaceholder')}
              />
              <Button
                className="w-full"
                disabled={busyAction === 'notes'}
                onClick={() =>
                  void runAction('notes', async () => {
                    await apiClient(`/api/v1/pastoral/sst/meetings/${meeting.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ general_notes: generalNotes }),
                      silent: true,
                    });
                  })
                }
              >
                <Save className="me-2 h-4 w-4" />
                {t('saveNotes')}
              </Button>
            </div>
          </section>

          {error ? (
            <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgendaItemEditor({
  item,
  t,
  busy,
  onSave,
}: {
  item: SstAgendaItem;
  t: (key: string) => string;
  busy: boolean;
  onSave: (discussion_notes: string, decisions: string) => Promise<void>;
}) {
  const [discussionNotes, setDiscussionNotes] = React.useState(item.discussion_notes ?? '');
  const [decisions, setDecisions] = React.useState(item.decisions ?? '');

  return (
    <div className="rounded-2xl border border-border px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{item.description}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {t(`agendaSource.${item.source}` as never)}
          </p>
        </div>
        <span className="text-xs text-text-tertiary">{formatDate(item.created_at)}</span>
      </div>
      <div className="mt-4 grid gap-4">
        <div className="space-y-2">
          <Label>{t('discussionNotes')}</Label>
          <Textarea
            value={discussionNotes}
            onChange={(event) => setDiscussionNotes(event.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('decisions')}</Label>
          <Textarea
            value={decisions}
            onChange={(event) => setDecisions(event.target.value)}
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button disabled={busy} onClick={() => void onSave(discussionNotes, decisions)}>
            <Save className="me-2 h-4 w-4" />
            {t('saveAgendaItem')}
          </Button>
        </div>
      </div>
    </div>
  );
}
