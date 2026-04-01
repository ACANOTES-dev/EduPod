'use client';

import { Download, FileCheck2, ShieldAlert, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayTimeRange,
  getStaffDisplayName,
  pickLocalizedValue,
  type PaginatedResponse,
  type StaffOption,
  type TripPackPreview,
} from '../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';

export default function EngagementTripPackPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [preview, setPreview] = React.useState<TripPackPreview | null>(null);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDownloading, setIsDownloading] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);

      try {
        const [previewResponse, staffResponse] = await Promise.all([
          apiClient<TripPackPreview>(`/api/v1/engagement/events/${eventId}/trip-pack`),
          apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=500'),
        ]);

        if (!isMounted) {
          return;
        }

        setPreview(previewResponse);
        setStaffOptions(staffResponse.data);
      } catch (error) {
        console.error('[EngagementTripPackPage.loadData]', error);
        toast.error(t('tripPack.loadError'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [eventId, t]);

  async function downloadPdf() {
    setIsDownloading(true);

    try {
      await apiClient(`/api/v1/engagement/events/${eventId}/trip-pack/generate?locale=${locale}`, {
        method: 'POST',
      });

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const token = getAccessToken();
      const response = await fetch(
        `${apiUrl}/api/v1/engagement/events/${eventId}/trip-pack/download?locale=${locale}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error(`Trip pack download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `trip-pack-${eventId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('[EngagementTripPackPage.downloadPdf]', error);
      toast.error(t('tripPack.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading || !preview) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const staffLookup = new Map(
    staffOptions.map((staffMember) => [staffMember.id, getStaffDisplayName(staffMember)]),
  );
  const localizedTitle = pickLocalizedValue(locale, preview.event.title, preview.event.title_ar);
  const localizedLocation = pickLocalizedValue(
    locale,
    preview.event.location,
    preview.event.location_ar,
  );
  const medicalFlagCount = preview.students.filter(
    (student) => student.has_allergy || student.medical_notes,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={localizedTitle}
        description={t('tripPack.description')}
        actions={
          <Button onClick={() => void downloadPdf()} disabled={isDownloading}>
            <Download className="me-2 h-4 w-4" />
            {isDownloading ? t('tripPack.downloading') : t('tripPack.downloadPdf')}
          </Button>
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
                {formatDisplayDate(preview.event.start_date, locale)}
              </span>
              <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
                {formatDisplayTimeRange(preview.event.start_time, preview.event.end_time, locale)}
              </span>
              <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
                {localizedLocation || '—'}
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              {t('tripPack.generatedAt', {
                value: formatDisplayDateTime(preview.generated_at, locale),
              })}
            </p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              preview.event.risk_assessment_approved
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {preview.event.risk_assessment_approved
              ? t('tripPack.riskApproved')
              : t('tripPack.riskPending')}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">{t('tripPack.rosterCount')}</p>
              <p className="text-2xl font-semibold text-text-primary">{preview.students.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-800">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">{t('tripPack.medicalFlags')}</p>
              <p className="text-2xl font-semibold text-text-primary">{medicalFlagCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">{t('tripPack.consentGranted')}</p>
              <p className="text-2xl font-semibold text-text-primary">
                {preview.students.filter((student) => student.consent_status === 'granted').length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">{t('tripPack.staffHeading')}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {preview.staff.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('tripPack.noStaff')}</p>
          ) : (
            preview.staff.map((staffMember) => (
              <div
                key={`${staffMember.id}-${staffMember.role}`}
                className="rounded-2xl border border-border px-4 py-3"
              >
                <p className="font-medium text-text-primary">
                  {staffLookup.get(staffMember.id) ?? staffMember.id}
                </p>
                <p className="text-xs text-text-secondary">{staffMember.role.replace(/_/g, ' ')}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">{t('tripPack.rosterHeading')}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                {['student', 'yearGroup', 'className', 'dateOfBirth', 'consent'].map((key) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary"
                  >
                    {t(`tripPack.columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.students.map((student) => (
                <tr
                  key={`${student.name}-${student.date_of_birth}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {student.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {student.year_group || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {student.class_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatDisplayDate(student.date_of_birth, locale)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        student.consent_status === 'granted'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {student.consent_status === 'granted'
                        ? t('tripPack.granted')
                        : t('tripPack.pending')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">{t('tripPack.medicalHeading')}</h2>
        <div className="mt-4 space-y-3">
          {medicalFlagCount === 0 ? (
            <p className="text-sm text-text-secondary">{t('tripPack.noMedicalFlags')}</p>
          ) : (
            preview.students
              .filter((student) => student.has_allergy || student.medical_notes)
              .map((student) => (
                <article
                  key={`${student.name}-${student.date_of_birth}-medical`}
                  className="rounded-2xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="font-medium text-text-primary">{student.name}</p>
                    {student.has_allergy ? (
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        {t('tripPack.allergyFlag')}
                      </span>
                    ) : null}
                  </div>
                  {student.allergy_details ? (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                      {student.allergy_details}
                    </div>
                  ) : null}
                  {student.medical_notes ? (
                    <p className="mt-3 text-sm text-text-secondary">{student.medical_notes}</p>
                  ) : null}
                </article>
              ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          {t('tripPack.emergencyHeading')}
        </h2>
        <div className="mt-4 space-y-4">
          {preview.students.map((student) => (
            <article
              key={`${student.name}-${student.date_of_birth}-contacts`}
              className="rounded-2xl border border-border p-4"
            >
              <p className="font-medium text-text-primary">{student.name}</p>
              {student.emergency_contacts.length === 0 ? (
                <p className="mt-2 text-sm text-text-secondary">
                  {t('tripPack.noEmergencyContacts')}
                </p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {student.emergency_contacts.map((contact, index) => (
                    <div
                      key={`${student.name}-${contact.phone}-${index}`}
                      className="rounded-2xl bg-surface-secondary/70 p-4"
                    >
                      <p className="font-medium text-text-primary">{contact.contact_name}</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {contact.relationship_label}
                      </p>
                      <p className="mt-2 text-sm font-medium text-text-primary" dir="ltr">
                        {contact.phone}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
