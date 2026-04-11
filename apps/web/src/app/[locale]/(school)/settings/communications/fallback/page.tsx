'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { UpdateInboxSettingsDto } from '@school/shared/inbox';
import { Button, Checkbox, Input, Label, Switch, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';

// ─── Form schema ──────────────────────────────────────────────────────────────
//
// The backend accepts the full `updateInboxSettingsSchema` — this form only
// drives the six fallback fields. We define a form-local schema so we can
// add the cross-field refinements (at least one channel when enabled)
// without touching the canonical `@school/shared/inbox` schema, which is
// shared with impl 13's messaging-policy settings page.

const FALLBACK_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
type FallbackChannel = (typeof FALLBACK_CHANNELS)[number];

const fallbackFormSchema = z
  .object({
    fallback_admin_enabled: z.boolean(),
    fallback_admin_after_hours: z.number().int().min(1).max(168),
    fallback_admin_channels: z.array(z.enum(FALLBACK_CHANNELS)),
    fallback_teacher_enabled: z.boolean(),
    fallback_teacher_after_hours: z.number().int().min(1).max(168),
    fallback_teacher_channels: z.array(z.enum(FALLBACK_CHANNELS)),
  })
  .refine((d) => !d.fallback_admin_enabled || d.fallback_admin_channels.length > 0, {
    path: ['fallback_admin_channels'],
    message: 'Select at least one channel',
  })
  .refine((d) => !d.fallback_teacher_enabled || d.fallback_teacher_channels.length > 0, {
    path: ['fallback_teacher_channels'],
    message: 'Select at least one channel',
  });

type FallbackFormValues = z.infer<typeof fallbackFormSchema>;

// ─── Backend response shape ───────────────────────────────────────────────────

interface InboxSettingsRow {
  fallback_admin_enabled: boolean;
  fallback_admin_after_hours: number;
  fallback_admin_channels: FallbackChannel[];
  fallback_teacher_enabled: boolean;
  fallback_teacher_after_hours: number;
  fallback_teacher_channels: FallbackChannel[];
}

const DEFAULTS: FallbackFormValues = {
  fallback_admin_enabled: false,
  fallback_admin_after_hours: 24,
  fallback_admin_channels: ['email'],
  fallback_teacher_enabled: false,
  fallback_teacher_after_hours: 3,
  fallback_teacher_channels: ['email'],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FallbackSettingsPage() {
  const t = useTranslations('inbox.fallback');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isTesting, setIsTesting] = React.useState({ admin: false, teacher: false });

  const form = useForm<FallbackFormValues>({
    resolver: zodResolver(fallbackFormSchema),
    defaultValues: DEFAULTS,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  const adminEnabled = watch('fallback_admin_enabled');
  const teacherEnabled = watch('fallback_teacher_enabled');

  // ─── Load current settings ────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient<InboxSettingsRow | { data: InboxSettingsRow }>(
          '/api/v1/inbox/settings/inbox',
        );
        if (cancelled) return;
        const row = unwrap<InboxSettingsRow>(response);
        reset({
          fallback_admin_enabled: row.fallback_admin_enabled ?? DEFAULTS.fallback_admin_enabled,
          fallback_admin_after_hours:
            row.fallback_admin_after_hours ?? DEFAULTS.fallback_admin_after_hours,
          fallback_admin_channels: row.fallback_admin_channels ?? DEFAULTS.fallback_admin_channels,
          fallback_teacher_enabled:
            row.fallback_teacher_enabled ?? DEFAULTS.fallback_teacher_enabled,
          fallback_teacher_after_hours:
            row.fallback_teacher_after_hours ?? DEFAULTS.fallback_teacher_after_hours,
          fallback_teacher_channels:
            row.fallback_teacher_channels ?? DEFAULTS.fallback_teacher_channels,
        });
      } catch (err) {
        console.error('[FallbackSettingsPage.load]', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reset]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const onSubmit = React.useCallback(
    async (values: FallbackFormValues) => {
      try {
        const payload: UpdateInboxSettingsDto = {
          fallback_admin_enabled: values.fallback_admin_enabled,
          fallback_admin_after_hours: values.fallback_admin_after_hours,
          fallback_admin_channels: values.fallback_admin_channels,
          fallback_teacher_enabled: values.fallback_teacher_enabled,
          fallback_teacher_after_hours: values.fallback_teacher_after_hours,
          fallback_teacher_channels: values.fallback_teacher_channels,
        };
        await apiClient('/api/v1/inbox/settings/inbox', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(t('save.success'));
        reset(values);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('save.error');
        toast.error(message);
      }
    },
    [reset, t],
  );

  // ─── Test fallback trigger ────────────────────────────────────────────────
  //
  // POSTs to `/v1/inbox/settings/fallback/test` — debug endpoint that
  // enqueues a one-shot `inbox:fallback-scan-tenant` job so an admin can
  // verify the fallback configuration without waiting for the 15-minute
  // cron. Gated by `INBOX_ALLOW_TEST_FALLBACK=true` on the server, so a
  // 403 response is an expected "disabled on this environment" state.
  // The endpoint itself lands in a follow-up impl — for now the button
  // hits a 404 and surfaces the error toast, which is acceptable UX.
  const testFallback = React.useCallback(
    async (source: 'admin' | 'teacher') => {
      setIsTesting((s) => ({ ...s, [source]: true }));
      try {
        await apiClient(`/api/v1/inbox/settings/fallback/test?source=${source}`, {
          method: 'POST',
        });
        toast.success(t('test.success'));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('test.error');
        toast.error(message);
      } finally {
        setIsTesting((s) => ({ ...s, [source]: false }));
      }
    },
    [t],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {isLoading ? (
        <div className="rounded-lg border border-border p-6 text-sm text-text-secondary">
          {t('loading')}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* ─── Admin broadcasts section ──────────────────────────────── */}
          <section className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('section.admin')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('section.adminDescription')}</p>
              </div>
              <Controller
                control={control}
                name="fallback_admin_enabled"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={t('fields.enabled')}
                  />
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="fallback_admin_after_hours">{t('fields.afterHours')}</Label>
                <Input
                  id="fallback_admin_after_hours"
                  type="number"
                  min={1}
                  max={168}
                  disabled={!adminEnabled}
                  className="mt-1 w-full"
                  {...register('fallback_admin_after_hours', { valueAsNumber: true })}
                />
                <p className="mt-1 text-xs text-text-secondary">{t('fields.afterHoursHint')}</p>
                {errors.fallback_admin_after_hours && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.fallback_admin_after_hours.message}
                  </p>
                )}
              </div>

              <div>
                <Label>{t('fields.channels')}</Label>
                <Controller
                  control={control}
                  name="fallback_admin_channels"
                  render={({ field }) => (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {FALLBACK_CHANNELS.map((ch) => {
                        const checked = field.value.includes(ch);
                        return (
                          <label
                            key={ch}
                            className="flex items-center gap-2 text-sm text-text-primary"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={!adminEnabled}
                              onCheckedChange={(next) => {
                                const nextArr = next
                                  ? [...field.value, ch]
                                  : field.value.filter((c) => c !== ch);
                                field.onChange(nextArr);
                              }}
                            />
                            <span>{t(`channels.${ch}`)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.fallback_admin_channels && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.fallback_admin_channels.message as string}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting.admin || !adminEnabled}
                onClick={() => testFallback('admin')}
              >
                {isTesting.admin ? t('test.pending') : t('test.button')}
              </Button>
            </div>
          </section>

          {/* ─── Teacher messages section ───────────────────────────────── */}
          <section className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('section.teacher')}</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('section.teacherDescription')}
                </p>
              </div>
              <Controller
                control={control}
                name="fallback_teacher_enabled"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={t('fields.enabled')}
                  />
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="fallback_teacher_after_hours">{t('fields.afterHours')}</Label>
                <Input
                  id="fallback_teacher_after_hours"
                  type="number"
                  min={1}
                  max={168}
                  disabled={!teacherEnabled}
                  className="mt-1 w-full"
                  {...register('fallback_teacher_after_hours', { valueAsNumber: true })}
                />
                <p className="mt-1 text-xs text-text-secondary">{t('fields.afterHoursHint')}</p>
                {errors.fallback_teacher_after_hours && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.fallback_teacher_after_hours.message}
                  </p>
                )}
              </div>

              <div>
                <Label>{t('fields.channels')}</Label>
                <Controller
                  control={control}
                  name="fallback_teacher_channels"
                  render={({ field }) => (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {FALLBACK_CHANNELS.map((ch) => {
                        const checked = field.value.includes(ch);
                        return (
                          <label
                            key={ch}
                            className="flex items-center gap-2 text-sm text-text-primary"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={!teacherEnabled}
                              onCheckedChange={(next) => {
                                const nextArr = next
                                  ? [...field.value, ch]
                                  : field.value.filter((c) => c !== ch);
                                field.onChange(nextArr);
                              }}
                            />
                            <span>{t(`channels.${ch}`)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.fallback_teacher_channels && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.fallback_teacher_channels.message as string}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting.teacher || !teacherEnabled}
                onClick={() => testFallback('teacher')}
              >
                {isTesting.teacher ? t('test.pending') : t('test.button')}
              </Button>
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? t('save.pending') : t('save.button')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
