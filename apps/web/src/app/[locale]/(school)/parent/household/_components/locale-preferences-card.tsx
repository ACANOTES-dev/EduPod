'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  householdLocaleUpdateSchema,
  type HouseholdLocaleUpdate,
  type RegisteredLocale,
} from '@school/shared';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { useTenantSupportedLocales } from '@/lib/use-tenant-supported-locales';

const NO_SECONDARY_LOCALE = 'none';

interface LocalePreferencesCardProps {
  householdId: string;
  initial: {
    dual_language_opt_in: boolean;
    secondary_locale: RegisteredLocale | null;
  };
}

export function LocalePreferencesCard({
  householdId,
  initial,
}: LocalePreferencesCardProps): React.ReactElement {
  const t = useTranslations('parent.household.localePreferences');
  const { locales, loading } = useTenantSupportedLocales();
  const form = useForm<HouseholdLocaleUpdate>({
    resolver: zodResolver(householdLocaleUpdateSchema),
    defaultValues: initial,
  });

  const onSubmit = React.useCallback(
    async (values: HouseholdLocaleUpdate) => {
      try {
        await apiClient(`/api/v1/households/${householdId}/locale-preferences`, {
          body: JSON.stringify(values),
          method: 'PATCH',
        });
        toast.success(t('saved'));
      } catch (err) {
        console.error('[LocalePreferencesCard]', err);
        toast.error(t('saveError'));
      }
    },
    [householdId, t],
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
      <form className="mt-4 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <Controller
          control={form.control}
          name="dual_language_opt_in"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="text-sm font-medium text-text-primary" htmlFor="dual-language">
                  {t('optInLabel')}
                </label>
                <p className="mt-1 text-xs text-text-secondary">{t('optInHint')}</p>
              </div>
              <Switch
                id="dual-language"
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            </div>
          )}
        />

        <Controller
          control={form.control}
          name="secondary_locale"
          render={({ field }) => (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="secondary-locale">
                {t('secondaryLocaleLabel')}
              </label>
              <Select
                disabled={loading}
                value={field.value ?? NO_SECONDARY_LOCALE}
                onValueChange={(value) =>
                  field.onChange(value === NO_SECONDARY_LOCALE ? null : value)
                }
              >
                <SelectTrigger id="secondary-locale">
                  <SelectValue placeholder={t('none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECONDARY_LOCALE}>{t('none')}</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.code} value={locale.code}>
                      {locale.nativeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />

        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? t('saving') : t('save')}
        </Button>
      </form>
    </section>
  );
}
