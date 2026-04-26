'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { createFinancialModelSchema } from '@school/shared/budgeting';
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

interface CreatedModel {
  model: { id: string };
}

// react-hook-form-friendly schema: horizon as string from Select, then coerced.
const formSchema = createFinancialModelSchema
  .pick({ name: true, description: true, fiscal_year_start: true })
  .extend({
    horizon_years: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    description: z.string().max(2_000).optional().or(z.literal('')),
  });
type FormValues = z.infer<typeof formSchema>;

export default function NewFinancialModelPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('financeBudgeting.models.createForm');
  const tHub = useTranslations('financeBudgeting');
  const router = useRouter();
  const locale = params.locale ?? 'en';
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const today = new Date();
  const defaultFyStart = `${today.getUTCFullYear()}-09-01`;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      fiscal_year_start: defaultFyStart,
      horizon_years: 1,
    },
  });

  const onSubmit = async (values: FormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const payload = {
        name: values.name,
        ...(values.description && values.description.length > 0
          ? { description: values.description }
          : {}),
        fiscal_year_start: values.fiscal_year_start,
        horizon_years: values.horizon_years,
      };
      const created = await apiClient<CreatedModel>('/api/v1/budgeting/financial-models', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      });
      router.push(`/${locale}/finance/budgeting/models/${created.model.id}`);
    } catch (err) {
      console.error('[NewFinancialModel.submit]', err);
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
          href: `/${locale}/finance/budgeting/models`,
          label: tHub('models.title'),
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

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="description">{t('description')}</Label>
          <Textarea id="description" rows={3} {...form.register('description')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="fiscal_year_start">{t('fiscalYearStart')}</Label>
            <Input
              id="fiscal_year_start"
              type="date"
              {...form.register('fiscal_year_start')}
              required
            />
            {form.formState.errors.fiscal_year_start && (
              <p className="text-xs text-red-600">
                {form.formState.errors.fiscal_year_start.message}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="horizon_years">{t('horizon')}</Label>
            <Controller
              name="horizon_years"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v) as 1 | 3 | 5)}
                >
                  <SelectTrigger id="horizon_years">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('horizonOptions.1')}</SelectItem>
                    <SelectItem value="3">{t('horizonOptions.3')}</SelectItem>
                    <SelectItem value="5">{t('horizonOptions.5')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/finance/budgeting/models`)}
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
