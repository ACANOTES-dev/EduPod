'use client';

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

import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import type { PastoralCriticalIncidentExternalSupportEntry, SearchOption } from '@/lib/pastoral';
import { searchStudents } from '@/lib/pastoral';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExternalSupportSectionProps {
  incidentId: string;
  externalSupport: PastoralCriticalIncidentExternalSupportEntry[];
  busyAction: string | null;
  onRunAction: (key: string, action: () => Promise<void>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExternalSupportSection({
  incidentId,
  externalSupport,
  busyAction,
  onRunAction,
}: ExternalSupportSectionProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');
  const sharedT = useTranslations('pastoral.shared');

  const [providerType, setProviderType] = React.useState<
    'neps_ci_team' | 'external_counsellor' | 'other'
  >('neps_ci_team');
  const [providerName, setProviderName] = React.useState('');
  const [contactPerson, setContactPerson] = React.useState('');
  const [contactDetails, setContactDetails] = React.useState('');
  const [visitDate, setVisitDate] = React.useState('');
  const [visitTimeStart, setVisitTimeStart] = React.useState('');
  const [visitTimeEnd, setVisitTimeEnd] = React.useState('');
  const [availabilityNotes, setAvailabilityNotes] = React.useState('');
  const [studentsSeen, setStudentsSeen] = React.useState<SearchOption[]>([]);
  const [outcomeNotes, setOutcomeNotes] = React.useState('');

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('externalSupportSection')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('externalSupportDescription')}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {externalSupport.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
            {t('noExternalSupport')}
          </p>
        ) : (
          externalSupport.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-border px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">{entry.provider_name}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t(`providerTypes.${entry.provider_type}` as never)}
                  </p>
                  <p className="mt-2 text-xs text-text-tertiary">
                    {entry.visit_date
                      ? t('visitMeta', { date: formatDate(entry.visit_date) })
                      : t('visitPending')}
                  </p>
                </div>
                <div className="text-xs text-text-tertiary">
                  {t('studentsSeenCount', { count: entry.students_seen.length })}
                </div>
              </div>
              {entry.outcome_notes ? (
                <p className="mt-3 text-sm text-text-secondary">{entry.outcome_notes}</p>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary">{t('addExternalSupport')}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('fields.providerType')}</Label>
            <Select
              value={providerType}
              onValueChange={(value) =>
                setProviderType(value as 'neps_ci_team' | 'external_counsellor' | 'other')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="neps_ci_team">{t('providerTypes.neps_ci_team')}</SelectItem>
                <SelectItem value="external_counsellor">
                  {t('providerTypes.external_counsellor')}
                </SelectItem>
                <SelectItem value="other">{t('providerTypes.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider_name">{t('fields.providerName')}</Label>
            <Input
              id="provider_name"
              value={providerName}
              onChange={(event) => setProviderName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_person">{t('fields.contactPerson')}</Label>
            <Input
              id="contact_person"
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_details">{t('fields.contactDetails')}</Label>
            <Input
              id="contact_details"
              value={contactDetails}
              onChange={(event) => setContactDetails(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visit_date">{t('fields.visitDate')}</Label>
            <Input
              id="visit_date"
              type="date"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="visit_time_start">{t('fields.visitTimeStart')}</Label>
              <Input
                id="visit_time_start"
                type="time"
                value={visitTimeStart}
                onChange={(event) => setVisitTimeStart(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visit_time_end">{t('fields.visitTimeEnd')}</Label>
              <Input
                id="visit_time_end"
                type="time"
                value={visitTimeEnd}
                onChange={(event) => setVisitTimeEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <SearchPicker
              label={t('fields.studentsSeen')}
              placeholder={t('fields.studentsSeenPlaceholder')}
              search={searchStudents}
              selected={studentsSeen}
              onChange={setStudentsSeen}
              emptyText={sharedT('noStudents')}
              minSearchLengthText={sharedT('minSearchLength')}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="availability_notes">{t('fields.availabilityNotes')}</Label>
            <Textarea
              id="availability_notes"
              value={availabilityNotes}
              onChange={(event) => setAvailabilityNotes(event.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="outcome_notes">{t('fields.outcomeNotes')}</Label>
            <Textarea
              id="outcome_notes"
              value={outcomeNotes}
              onChange={(event) => setOutcomeNotes(event.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={busyAction === 'add-external-support'}
            onClick={() =>
              void onRunAction('add-external-support', async () => {
                await apiClient(
                  `/api/v1/pastoral/critical-incidents/${incidentId}/external-support`,
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      provider_type: providerType,
                      provider_name: providerName.trim(),
                      contact_person: contactPerson.trim() || undefined,
                      contact_details: contactDetails.trim() || undefined,
                      visit_date: visitDate || undefined,
                      visit_time_start: visitTimeStart || undefined,
                      visit_time_end: visitTimeEnd || undefined,
                      availability_notes: availabilityNotes.trim() || undefined,
                      students_seen: studentsSeen.map((student) => student.id),
                      outcome_notes: outcomeNotes.trim() || undefined,
                    }),
                    silent: true,
                  },
                );

                setProviderName('');
                setContactPerson('');
                setContactDetails('');
                setVisitDate('');
                setVisitTimeStart('');
                setVisitTimeEnd('');
                setAvailabilityNotes('');
                setStudentsSeen([]);
                setOutcomeNotes('');
              })
            }
          >
            {t('recordExternalSupport')}
          </Button>
        </div>
      </div>
    </section>
  );
}
