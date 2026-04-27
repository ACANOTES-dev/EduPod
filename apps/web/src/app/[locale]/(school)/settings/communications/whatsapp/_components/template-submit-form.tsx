'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Input, Label, toast } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import type { TemplateRow } from './template-list';

const submitTemplateSchema = z.object({
  template_key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9._-]+$/i, 'lowercase alphanumeric with . _ -'),
  language_code: z.enum(['en', 'ar']),
  category: z.enum(['transactional', 'marketing', 'authentication', 'utility']),
  body: z
    .string()
    .min(1)
    .max(1024, 'WhatsApp body must be ≤ 1024 chars')
    .refine((b) => !b.includes('{{0}}'), 'Variables start at {{1}}, not {{0}}'),
});
type SubmitTemplateForm = z.infer<typeof submitTemplateSchema>;

export function TemplateSubmitForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('settings.communications.whatsapp.templates.submitForm');
  const [open, setOpen] = React.useState(false);

  const form = useForm<SubmitTemplateForm>({
    resolver: zodResolver(submitTemplateSchema),
    defaultValues: { template_key: '', language_code: 'en', category: 'transactional', body: '' },
  });

  const onSave = form.handleSubmit(async (values) => {
    try {
      const raw = await apiClient<{ data: TemplateRow } | TemplateRow>(
        '/api/v1/whatsapp-templates',
        { method: 'POST', body: JSON.stringify(values) },
      );
      const created = unwrap<TemplateRow>(raw);
      try {
        await apiClient(`/api/v1/whatsapp-templates/${created.id}/submit`, { method: 'POST' });
        toast.success(t('success'));
      } catch (submitErr) {
        const message = submitErr instanceof Error ? submitErr.message : '';
        toast.warning(t('partial') + (message ? ` (${message})` : ''));
      }
      form.reset();
      onCreated();
      setOpen(false);
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('error'));
    }
  });

  if (!open) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface p-6">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {t('addButton')}
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
      <form onSubmit={onSave} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          label={t('templateKey')}
          hint={t('templateKeyHint')}
          error={form.formState.errors.template_key?.message}
        >
          <Input
            id="template_key"
            type="text"
            dir="ltr"
            className="text-base font-mono"
            placeholder="parent_attendance_alert"
            {...form.register('template_key')}
          />
        </FormField>
        <FormField label={t('languageCode')}>
          <select
            id="language_code"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base"
            {...form.register('language_code')}
          >
            <option value="en">en</option>
            <option value="ar">ar</option>
          </select>
        </FormField>
        <FormField label={t('category')}>
          <select
            id="category"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base"
            {...form.register('category')}
          >
            <option value="transactional">transactional</option>
            <option value="utility">utility</option>
            <option value="authentication">authentication</option>
            <option value="marketing">marketing</option>
          </select>
        </FormField>
        <FormField
          label={t('body')}
          hint={t('bodyHint')}
          error={form.formState.errors.body?.message}
          fullWidth
        >
          <textarea
            id="body"
            rows={4}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
            {...form.register('body')}
          />
        </FormField>
        <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              form.reset();
            }}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('submitting') : t('saveAndSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function FormField({
  label,
  hint,
  error,
  fullWidth,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
