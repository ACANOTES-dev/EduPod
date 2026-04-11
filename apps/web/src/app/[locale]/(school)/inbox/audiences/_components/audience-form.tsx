'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { AudienceDefinition } from '@school/shared/inbox';
import { Button, Input, Label, RadioGroup, RadioGroupItem, Textarea, toast } from '@school/ui';

import { AudienceChipBuilder } from './audience-chip-builder';
import { AudiencePreview } from './audience-preview';
import { PeoplePicker } from './people-picker';
import type { ProviderInfo } from './types';

const formSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(1024).nullable().optional(),
  kind: z.enum(['static', 'dynamic']),
});

type FormValues = z.infer<typeof formSchema>;

export interface AudienceFormInitialValues {
  name: string;
  description: string | null;
  kind: 'static' | 'dynamic';
  definition?: AudienceDefinition | null;
  userIds?: string[];
}

interface AudienceFormProps {
  initialValues?: AudienceFormInitialValues;
  lockKind?: boolean;
  submitLabel: string;
  onSubmit: (payload: {
    name: string;
    description: string | null;
    kind: 'static' | 'dynamic';
    definition: AudienceDefinition | { user_ids: string[] };
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  providers: ProviderInfo[];
  providersLoading: boolean;
}

export function AudienceForm({
  initialValues,
  lockKind = false,
  submitLabel,
  onSubmit,
  providers,
  providersLoading,
}: AudienceFormProps) {
  const t = useTranslations('inbox.audiences.form');
  const tErrors = useTranslations('inbox.audiences.errors');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      description: initialValues?.description ?? '',
      kind: initialValues?.kind ?? 'dynamic',
    },
  });

  const [definition, setDefinition] = React.useState<AudienceDefinition | null>(
    initialValues?.definition ?? null,
  );
  const [userIds, setUserIds] = React.useState<string[]>(initialValues?.userIds ?? []);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const kind = form.watch('kind');

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null);

    if (values.kind === 'static') {
      if (userIds.length === 0) {
        setServerError(tErrors('noMembers'));
        return;
      }
    } else if (!definition) {
      setServerError(tErrors('noDefinition'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        kind: values.kind,
        definition:
          values.kind === 'static' ? { user_ids: userIds } : (definition as AudienceDefinition),
      };
      const result = await onSubmit(payload);
      if (!result.ok) {
        setServerError(result.error);
      }
    } catch (err) {
      console.error('[AudienceForm.submit]', err);
      const message =
        (err as { error?: { code?: string; message?: string } })?.error?.message ??
        (err as { message?: string })?.message ??
        tErrors('generic');
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="audience-name">{t('name.label')}</Label>
        <Input
          id="audience-name"
          {...form.register('name')}
          placeholder={t('name.placeholder')}
          maxLength={255}
          aria-invalid={!!form.formState.errors.name}
        />
        {form.formState.errors.name && (
          <p className="text-xs text-danger-text">{t('name.required')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience-description">{t('description.label')}</Label>
        <Textarea
          id="audience-description"
          {...form.register('description')}
          placeholder={t('description.placeholder')}
          maxLength={1024}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('kind.label')}</Label>
        <RadioGroup
          value={kind}
          onValueChange={(value) =>
            form.setValue('kind', value as 'static' | 'dynamic', { shouldDirty: true })
          }
          disabled={lockKind}
          className="flex flex-col gap-2 sm:flex-row sm:gap-4"
        >
          <label className="flex items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
            <RadioGroupItem value="dynamic" id="kind-dynamic" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-text-primary">{t('kind.dynamic.title')}</div>
              <p className="text-xs text-text-secondary">{t('kind.dynamic.description')}</p>
            </div>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-border p-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
            <RadioGroupItem value="static" id="kind-static" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-text-primary">{t('kind.static.title')}</div>
              <p className="text-xs text-text-secondary">{t('kind.static.description')}</p>
            </div>
          </label>
        </RadioGroup>
        {lockKind && <p className="text-xs text-text-secondary">{t('kind.locked')}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,18rem]">
        <div className="space-y-2">
          <Label>{t('builder.label')}</Label>
          {kind === 'dynamic' ? (
            providersLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-border p-4 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('builder.loadingProviders')}
              </div>
            ) : (
              <AudienceChipBuilder
                value={definition}
                onChange={setDefinition}
                providers={providers}
                disabled={submitting}
              />
            )
          ) : (
            <PeoplePicker selectedUserIds={userIds} onChange={setUserIds} disabled={submitting} />
          )}
        </div>

        <div>
          {kind === 'static' ? (
            <AudiencePreview staticUserIds={userIds} />
          ) : (
            <AudiencePreview definition={definition} />
          )}
        </div>
      </div>

      {serverError && (
        <div className="rounded-md border border-danger-fill bg-danger-fill/30 p-3 text-sm text-danger-text">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="me-2 h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
