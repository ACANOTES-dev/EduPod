'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface CreatedEventBudget {
  id: string;
}

const eventTypeValues = [
  'trip',
  'fundraiser',
  'sports_day',
  'performance',
  'capital_purchase',
  'other',
] as const;
const paymentPlanValues = ['one_off', 'two_payments', 'three_payments', 'four_payments'] as const;

const formSchema = z.object({
  name: z.string().min(1).max(255),
  event_type: z.enum(eventTypeValues),
  event_date: z.string().optional().or(z.literal('')),
  event_end_date: z.string().optional().or(z.literal('')),
  participant_count: z.coerce.number().int().min(0),
  household_share_pct: z.coerce.number().min(0).max(100),
  payment_plan: z.enum(paymentPlanValues),
  notes: z.string().max(2_000).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof formSchema>;

export default function NewEventBudgetPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('financeBudgeting.events.createForm');
  const tEvents = useTranslations('financeBudgeting.events');
  const router = useRouter();
  const locale = params.locale ?? 'en';
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      event_type: 'trip',
      event_date: '',
      event_end_date: '',
      participant_count: 0,
      household_share_pct: 100,
      payment_plan: 'one_off',
      notes: '',
    },
  });

  const watchedShare = form.watch('household_share_pct');

  const onSubmit = async (values: FormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        event_type: values.event_type,
        participant_count: values.participant_count,
        household_share_pct: values.household_share_pct,
        payment_plan: values.payment_plan,
      };
      if (values.event_date && values.event_date.length > 0) {
        payload.event_date = values.event_date;
      }
      if (values.event_end_date && values.event_end_date.length > 0) {
        payload.event_end_date = values.event_end_date;
      }
      if (values.notes && values.notes.length > 0) {
        payload.notes = values.notes;
      }

      const res = await apiClient<{ data: CreatedEventBudget } | CreatedEventBudget>(
        '/api/v1/budgeting/event-budgets',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const created = 'data' in res ? res.data : res;
      router.push(`/${locale}/finance/budgeting/events/${created.id}`);
    } catch (err) {
      console.error('[NewEventBudget.submit]', err);
      const msg = err instanceof Error ? err.message : t('submitError');
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6 pb-10">
      <PageHeader
        title={t('title')}
        back={{
          href: `/${locale}/finance/budgeting/events`,
          label: tEvents('title'),
        }}
      />

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex w-full max-w-2xl min-w-0 flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="name">{t('name')}</Label>
          <Input id="name" {...form.register('name')} maxLength={255} required />
          {form.formState.errors.name && (
            <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="event_type">{t('type')}</Label>
            <Controller
              name="event_type"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="event_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypeValues.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {tEvents(`types.${tp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="participant_count">{t('participantCount')}</Label>
            <Input
              id="participant_count"
              type="number"
              min={0}
              {...form.register('participant_count')}
            />
            {form.formState.errors.participant_count && (
              <p className="text-xs text-red-600">
                {form.formState.errors.participant_count.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="event_date">{t('eventDate')}</Label>
            <Input id="event_date" type="date" {...form.register('event_date')} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="event_end_date">{t('eventEndDate')}</Label>
            <Input id="event_end_date" type="date" {...form.register('event_end_date')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="household_share_pct">
              {t('householdSharePct')} ({watchedShare}%)
            </Label>
            <Input
              id="household_share_pct"
              type="range"
              min={0}
              max={100}
              step={1}
              {...form.register('household_share_pct')}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="payment_plan">{t('paymentPlan')}</Label>
            <Controller
              name="payment_plan"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="payment_plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentPlanValues.map((pp) => (
                      <SelectItem key={pp} value={pp}>
                        {t(`paymentPlanOptions.${pp}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="notes">{t('notes')}</Label>
          <Textarea id="notes" rows={3} {...form.register('notes')} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/finance/budgeting/events`)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? `${t('submit')}…` : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
