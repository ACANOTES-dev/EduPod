'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createEngagementEventSchema, type CreateEngagementEventDto } from '@school/shared';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import {
  EVENT_TYPE_OPTIONS,
  TARGET_TYPE_OPTIONS,
  formatDisplayDate,
  pickLocalizedValue,
  type AcademicYearOption,
  type ClassOption,
  type EventRecord,
  type FormTemplateRecord,
  type PaginatedResponse,
  type StaffOption,
  type StudentOption,
  type YearGroupOption,
} from './engagement-types';

import { apiClient } from '@/lib/api-client';


const STEP_KEYS = ['basicInfo', 'schedule', 'compliance', 'fees', 'staff', 'targeting'] as const;

const STEP_FIELD_MAP: Record<(typeof STEP_KEYS)[number], Array<keyof CreateEngagementEventDto>> = {
  basicInfo: ['title', 'event_type', 'academic_year_id'],
  schedule: ['start_date', 'end_date', 'location', 'capacity', 'slot_duration_minutes'],
  compliance: [
    'consent_form_template_id',
    'risk_assessment_required',
    'risk_assessment_template_id',
  ],
  fees: [
    'fee_amount',
    'fee_description',
    'consent_deadline',
    'payment_deadline',
    'booking_deadline',
  ],
  staff: ['staff_ids'],
  targeting: ['target_type', 'target_config_json'],
};

function toggleSelection(current: string[] | undefined, value: string): string[] {
  const next = new Set(current ?? []);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return [...next];
}

export function EventWizard() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');
  const [stepIndex, setStepIndex] = React.useState(0);
  const [academicYears, setAcademicYears] = React.useState<AcademicYearOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [staff, setStaff] = React.useState<StaffOption[]>([]);
  const [formTemplates, setFormTemplates] = React.useState<FormTemplateRecord[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<CreateEngagementEventDto>({
    resolver: zodResolver(createEngagementEventSchema),
    defaultValues: {
      title: '',
      title_ar: '',
      description: '',
      description_ar: '',
      event_type: 'school_trip',
      target_type: 'whole_school',
      target_config_json: {},
      risk_assessment_required: false,
      staff_ids: [],
    },
  });

  const stepKey = STEP_KEYS[stepIndex] ?? STEP_KEYS[0];
  const eventType = form.watch('event_type');
  const targetType = form.watch('target_type');
  const riskAssessmentRequired = form.watch('risk_assessment_required');
  const selectedStaffIds = form.watch('staff_ids') ?? [];
  const selectedYearGroupIds = form.watch('target_config_json.year_group_ids') ?? [];
  const selectedClassIds = form.watch('target_config_json.class_ids') ?? [];
  const selectedStudentIds = form.watch('target_config_json.student_ids') ?? [];

  React.useEffect(() => {
    Promise.all([
      apiClient<PaginatedResponse<AcademicYearOption>>(
        '/api/v1/academic-years?page=1&pageSize=100',
      ),
      apiClient<YearGroupOption[]>('/api/v1/year-groups'),
      apiClient<PaginatedResponse<ClassOption>>('/api/v1/classes?page=1&pageSize=100'),
      apiClient<PaginatedResponse<StudentOption>>('/api/v1/students?page=1&pageSize=100'),
      apiClient<PaginatedResponse<StaffOption>>('/api/v1/staff-profiles?page=1&pageSize=100'),
      apiClient<PaginatedResponse<FormTemplateRecord>>(
        '/api/v1/engagement/form-templates?page=1&pageSize=100&status=published',
      ),
    ])
      .then(
        ([
          academicYearsResponse,
          yearGroupsResponse,
          classesResponse,
          studentsResponse,
          staffResponse,
          formTemplatesResponse,
        ]) => {
          setAcademicYears(academicYearsResponse.data);
          setYearGroups(yearGroupsResponse);
          setClasses(classesResponse.data);
          setStudents(studentsResponse.data);
          setStaff(staffResponse.data);
          setFormTemplates(formTemplatesResponse.data);
        },
      )
      .catch((error) => {
        console.error('[EventWizard.loadReferenceData]', error);
      });
  }, []);

  const consentTemplates = React.useMemo(
    () => formTemplates.filter((template) => template.form_type === 'consent_form'),
    [formTemplates],
  );

  const riskTemplates = React.useMemo(
    () => formTemplates.filter((template) => template.form_type === 'risk_assessment'),
    [formTemplates],
  );

  const nextStep = React.useCallback(async () => {
    const stepFields = STEP_FIELD_MAP[stepKey];
    const isValid = await form.trigger(stepFields as never);

    if (!isValid) {
      toast.error(t('wizard.fixValidation'));
      return;
    }

    setStepIndex((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }, [form, stepKey, t]);

  const previousStep = React.useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);

    try {
      const payload: CreateEngagementEventDto = {
        ...values,
        target_config_json:
          values.target_type === 'whole_school'
            ? undefined
            : {
                year_group_ids: values.target_config_json?.year_group_ids,
                class_ids: values.target_config_json?.class_ids,
                student_ids: values.target_config_json?.student_ids,
              },
        fee_amount:
          values.fee_amount !== undefined && values.fee_amount !== null && values.fee_amount !== 0
            ? Number(values.fee_amount)
            : undefined,
        title_ar: values.title_ar || undefined,
        description: values.description || undefined,
        description_ar: values.description_ar || undefined,
        location: values.location || undefined,
        location_ar: values.location_ar || undefined,
        fee_description: values.fee_description || undefined,
        consent_form_template_id: values.consent_form_template_id || undefined,
        risk_assessment_template_id: values.risk_assessment_template_id || undefined,
        consent_deadline: values.consent_deadline || undefined,
        payment_deadline: values.payment_deadline || undefined,
        booking_deadline: values.booking_deadline || undefined,
      };

      const createdEvent = await apiClient<EventRecord>('/api/v1/engagement/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success(t('wizard.createSuccess'));
      router.push(`/${locale}/engagement/events/${createdEvent.id}`);
    } catch (error) {
      console.error('[EventWizard.onSubmit]', error);
      toast.error(t('wizard.createError'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="grid gap-3 md:grid-cols-6">
          {STEP_KEYS.map((key, index) => {
            const active = index === stepIndex;
            const complete = index < stepIndex;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`rounded-2xl border px-4 py-3 text-start transition-colors ${
                  active
                    ? 'border-primary-300 bg-primary-50'
                    : complete
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-border bg-surface-secondary/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span className="text-xs font-semibold text-text-tertiary">{index + 1}</span>
                  )}
                  <span className="text-sm font-medium text-text-primary">
                    {t(`wizard.steps.${key}`)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-border bg-surface p-6">
          {stepKey === 'basicInfo' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{t('wizard.title')}</Label>
                <Input {...form.register('title')} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('wizard.titleAr')}</Label>
                <Input dir="rtl" {...form.register('title_ar')} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('wizard.description')}</Label>
                <Textarea className="min-h-24" {...form.register('description')} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('wizard.descriptionAr')}</Label>
                <Textarea dir="rtl" className="min-h-24" {...form.register('description_ar')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.eventType')}</Label>
                <Controller
                  control={form.control}
                  name="event_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(`eventTypes.${option.label}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.academicYear')}</Label>
                <Controller
                  control={form.control}
                  name="academic_year_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('wizard.selectAcademicYear')} />
                      </SelectTrigger>
                      <SelectContent>
                        {academicYears.map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          ) : null}

          {stepKey === 'schedule' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('wizard.startDate')}</Label>
                <Input type="date" {...form.register('start_date')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.endDate')}</Label>
                <Input type="date" {...form.register('end_date')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.startTime')}</Label>
                <Input type="time" {...form.register('start_time')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.endTime')}</Label>
                <Input type="time" {...form.register('end_time')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.location')}</Label>
                <Input {...form.register('location')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.locationAr')}</Label>
                <Input dir="rtl" {...form.register('location_ar')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.capacity')}</Label>
                <Input
                  type="number"
                  {...form.register('capacity', {
                    setValueAs: (value) => (value ? Number(value) : undefined),
                  })}
                />
              </div>
              {eventType === 'parent_conference' ? (
                <>
                  <div className="space-y-2">
                    <Label>{t('wizard.slotDuration')}</Label>
                    <Input
                      type="number"
                      {...form.register('slot_duration_minutes', {
                        setValueAs: (value) => (value ? Number(value) : undefined),
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('wizard.bufferMinutes')}</Label>
                    <Input
                      type="number"
                      {...form.register('buffer_minutes', {
                        setValueAs: (value) => (value ? Number(value) : undefined),
                      })}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {stepKey === 'compliance' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('wizard.consentTemplate')}</Label>
                <Controller
                  control={form.control}
                  name="consent_form_template_id"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(nextValue) =>
                        field.onChange(nextValue === '__none__' ? undefined : nextValue)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('wizard.optionalLink')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t('wizard.noLinkedTemplate')}</SelectItem>
                        {consentTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                <Controller
                  control={form.control}
                  name="risk_assessment_required"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    />
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {t('wizard.riskAssessmentRequired')}
                  </p>
                  <p className="text-xs text-text-tertiary">{t('wizard.riskAssessmentHint')}</p>
                </div>
              </div>

              {riskAssessmentRequired ? (
                <div className="space-y-2">
                  <Label>{t('wizard.riskTemplate')}</Label>
                  <Controller
                    control={form.control}
                    name="risk_assessment_template_id"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? '__none__'}
                        onValueChange={(nextValue) =>
                          field.onChange(nextValue === '__none__' ? undefined : nextValue)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('wizard.selectRiskTemplate')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('wizard.noLinkedTemplate')}</SelectItem>
                          {riskTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {stepKey === 'fees' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('wizard.feeAmount')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register('fee_amount', {
                    setValueAs: (value) => (value ? Number(value) : undefined),
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.feeDescription')}</Label>
                <Input {...form.register('fee_description')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.consentDeadline')}</Label>
                <Input type="date" {...form.register('consent_deadline')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.paymentDeadline')}</Label>
                <Input type="date" {...form.register('payment_deadline')} />
              </div>
              <div className="space-y-2">
                <Label>{t('wizard.bookingDeadline')}</Label>
                <Input type="date" {...form.register('booking_deadline')} />
              </div>
            </div>
          ) : null}

          {stepKey === 'staff' ? (
            <div className="space-y-3">
              {staff.map((staffMember) => {
                const displayName =
                  staffMember.user?.name ||
                  [staffMember.first_name, staffMember.last_name].filter(Boolean).join(' ') ||
                  staffMember.user?.email ||
                  staffMember.staff_number ||
                  staffMember.id;

                return (
                  <label
                    key={staffMember.id}
                    className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{displayName}</p>
                      {staffMember.staff_number ? (
                        <p className="text-xs text-text-tertiary">{staffMember.staff_number}</p>
                      ) : null}
                    </div>
                    <Checkbox
                      checked={selectedStaffIds.includes(staffMember.id)}
                      onCheckedChange={() =>
                        form.setValue(
                          'staff_ids',
                          toggleSelection(selectedStaffIds, staffMember.id),
                          { shouldDirty: true },
                        )
                      }
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          {stepKey === 'targeting' ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>{t('wizard.targetType')}</Label>
                <Controller
                  control={form.control}
                  name="target_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(`targetTypes.${option.label}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {targetType === 'year_group' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {yearGroups.map((yearGroup) => (
                    <label
                      key={yearGroup.id}
                      className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                    >
                      <span className="font-medium text-text-primary">{yearGroup.name}</span>
                      <Checkbox
                        checked={selectedYearGroupIds.includes(yearGroup.id)}
                        onCheckedChange={() =>
                          form.setValue(
                            'target_config_json.year_group_ids',
                            toggleSelection(selectedYearGroupIds, yearGroup.id),
                            { shouldDirty: true },
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              {targetType === 'class_group' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {classes.map((classOption) => (
                    <label
                      key={classOption.id}
                      className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-text-primary">{classOption.name}</p>
                        {classOption.year_group?.name ? (
                          <p className="text-xs text-text-tertiary">
                            {classOption.year_group.name}
                          </p>
                        ) : null}
                      </div>
                      <Checkbox
                        checked={selectedClassIds.includes(classOption.id)}
                        onCheckedChange={() =>
                          form.setValue(
                            'target_config_json.class_ids',
                            toggleSelection(selectedClassIds, classOption.id),
                            { shouldDirty: true },
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              {targetType === 'custom' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {students.map((student) => (
                    <label
                      key={student.id}
                      className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                    >
                      <span className="font-medium text-text-primary">
                        {student.first_name} {student.last_name}
                      </span>
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={() =>
                          form.setValue(
                            'target_config_json.student_ids',
                            toggleSelection(selectedStudentIds, student.id),
                            { shouldDirty: true },
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <Button type="button" variant="ghost" onClick={previousStep} disabled={stepIndex === 0}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {t('wizard.previousStep')}
            </Button>

            {stepIndex < STEP_KEYS.length - 1 ? (
              <Button type="button" onClick={nextStep}>
                {t('wizard.nextStep')}
                <ArrowRight className="ms-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting}>
                {submitting ? t('wizard.creating') : t('wizard.createEvent')}
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('wizard.reviewTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('wizard.reviewHint')}</p>

            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-text-tertiary">{t('wizard.title')}</dt>
                <dd className="font-medium text-text-primary">{form.watch('title') || '—'}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.eventType')}</dt>
                <dd className="font-medium text-text-primary">
                  {t(
                    `eventTypes.${
                      EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.label ??
                      'schoolTrip'
                    }`,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.dateRange')}</dt>
                <dd className="font-medium text-text-primary">
                  {formatDisplayDate(form.watch('start_date'), locale)} -{' '}
                  {formatDisplayDate(form.watch('end_date'), locale)}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.location')}</dt>
                <dd className="font-medium text-text-primary">
                  {pickLocalizedValue(locale, form.watch('location'), form.watch('location_ar')) ||
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.linkedConsent')}</dt>
                <dd className="font-medium text-text-primary">
                  {consentTemplates.find(
                    (template) => template.id === form.watch('consent_form_template_id'),
                  )?.name ?? t('wizard.noneLinked')}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.selectedStaff')}</dt>
                <dd className="font-medium text-text-primary">{selectedStaffIds.length}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">{t('wizard.targetSummary')}</dt>
                <dd className="font-medium text-text-primary">
                  {targetType === 'whole_school'
                    ? t('wizard.wholeSchoolSummary')
                    : targetType === 'year_group'
                      ? t('wizard.targetCount', { count: selectedYearGroupIds.length })
                      : targetType === 'class_group'
                        ? t('wizard.targetCount', { count: selectedClassIds.length })
                        : t('wizard.targetCount', { count: selectedStudentIds.length })}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </form>
  );
}
