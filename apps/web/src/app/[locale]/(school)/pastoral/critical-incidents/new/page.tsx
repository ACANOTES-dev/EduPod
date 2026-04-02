/* eslint-disable school/no-hand-rolled-forms -- legacy form, tracked for migration in HR-025 */
'use client';

import { Save } from 'lucide-react';
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
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  getLocaleFromPathname,
  loadClasses,
  loadYearGroups,
  PASTORAL_CRITICAL_INCIDENT_SCOPES,
  PASTORAL_CRITICAL_INCIDENT_TYPES,
  type ClassOption,
  type PastoralApiDetailResponse,
  type YearGroupOption,
} from '@/lib/pastoral';

export default function NewCriticalIncidentPage() {
  const t = useTranslations('pastoral.newCriticalIncident');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [incidentType, setIncidentType] = React.useState('bereavement');
  const [incidentTypeOther, setIncidentTypeOther] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [incidentDate, setIncidentDate] = React.useState('');
  const [scope, setScope] = React.useState('whole_school');
  const [selectedYearGroupIds, setSelectedYearGroupIds] = React.useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    void Promise.all([loadYearGroups(), loadClasses()])
      .then(([nextYearGroups, nextClasses]) => {
        setYearGroups(nextYearGroups);
        setClasses(nextClasses);
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!incidentDate) {
      setError(t('errors.date'));
      return;
    }
    if (description.trim().length < 10) {
      setError(t('errors.description'));
      return;
    }
    if (incidentType === 'other' && !incidentTypeOther.trim()) {
      setError(t('errors.otherType'));
      return;
    }
    if (scope === 'year_group' && selectedYearGroupIds.length === 0) {
      setError(t('errors.yearGroups'));
      return;
    }
    if (scope === 'class' && selectedClassIds.length === 0) {
      setError(t('errors.classes'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<PastoralApiDetailResponse<{ id: string }>>(
        '/api/v1/pastoral/critical-incidents',
        {
          method: 'POST',
          body: JSON.stringify({
            incident_type: incidentType,
            incident_type_other: incidentTypeOther.trim() || undefined,
            description: description.trim(),
            incident_date: incidentDate,
            scope,
            scope_year_group_ids: scope === 'year_group' ? selectedYearGroupIds : undefined,
            scope_class_ids: scope === 'class' ? selectedClassIds : undefined,
          }),
        },
      );

      router.push(`/${locale}/pastoral/critical-incidents/${response.data.id}`);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('incidentSection')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('fields.type')}</Label>
                <Select value={incidentType} onValueChange={setIncidentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_CRITICAL_INCIDENT_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`types.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident_date">{t('fields.date')}</Label>
                <Input
                  id="incident_date"
                  type="date"
                  value={incidentDate}
                  onChange={(event) => setIncidentDate(event.target.value)}
                />
              </div>

              {incidentType === 'other' ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="incident_type_other">{t('fields.otherType')}</Label>
                  <Input
                    id="incident_type_other"
                    value={incidentTypeOther}
                    onChange={(event) => setIncidentTypeOther(event.target.value)}
                    placeholder={t('fields.otherTypePlaceholder')}
                  />
                </div>
              ) : null}

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">{t('fields.description')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={6}
                  placeholder={t('fields.descriptionPlaceholder')}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('scopeSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{t('fields.scope')}</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PASTORAL_CRITICAL_INCIDENT_SCOPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`scope.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {scope === 'year_group' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {yearGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedYearGroupIds.includes(group.id)}
                        onChange={(event) =>
                          setSelectedYearGroupIds((current) =>
                            event.target.checked
                              ? [...current, group.id]
                              : current.filter((value) => value !== group.id),
                          )
                        }
                        className="h-4 w-4 rounded border-border text-emerald-600"
                      />
                      <span className="text-sm text-text-primary">{group.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {scope === 'class' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {classes.map((classItem) => (
                    <label
                      key={classItem.id}
                      className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(classItem.id)}
                        onChange={(event) =>
                          setSelectedClassIds((current) =>
                            event.target.checked
                              ? [...current, classItem.id]
                              : current.filter((value) => value !== classItem.id),
                          )
                        }
                        className="h-4 w-4 rounded border-border text-emerald-600"
                      />
                      <span className="text-sm text-text-primary">
                        {classItem.name}
                        {classItem.year_group ? ` · ${classItem.year_group.name}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('submitSection')}</h2>
            <div className="mt-4 space-y-4">
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Save className="me-2 h-4 w-4" />
                {isSubmitting ? t('saving') : t('submit')}
              </Button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
