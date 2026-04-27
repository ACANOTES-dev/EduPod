'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type MaskedWhatsAppConfig,
  type TestWhatsAppDto,
  type UpsertWhatsAppConfigDto,
  testWhatsAppSchema,
  upsertWhatsAppConfigSchema,
} from '@school/shared';
import { Button, Input, Label, toast } from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';

import { NoPermissionState } from '../_components/no-permission-state';
import { PasswordInput } from '../_components/password-input';

import { TemplateList, type TemplateRow } from './_components/template-list';
import { TemplateSubmitForm } from './_components/template-submit-form';

type TestResult =
  | { kind: 'success'; sentAt: Date }
  | { kind: 'failure'; providerError: string }
  | { kind: 'rate_limited'; retryAfterMin: number };

export default function WhatsAppConfigPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const t = useTranslations('settings.communications.whatsapp');
  const tCommon = useTranslations('settings.communications');
  const { hasAnyRole } = useRoleCheck();

  const canManage = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');

  const [masked, setMasked] = React.useState<MaskedWhatsAppConfig | null>(null);
  const [isConfigured, setIsConfigured] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);
  const [approvedTemplates, setApprovedTemplates] = React.useState<TemplateRow[]>([]);
  const [templatesReloadKey, setTemplatesReloadKey] = React.useState(0);

  const form = useForm<UpsertWhatsAppConfigDto>({
    resolver: zodResolver(upsertWhatsAppConfigSchema),
    defaultValues: {
      twilio_account_sid: '',
      twilio_auth_token: '',
      twilio_whatsapp_from_number: '',
      business_profile_id: '',
      webhook_secret: '',
    },
  });

  const testForm = useForm<TestWhatsAppDto>({
    resolver: zodResolver(testWhatsAppSchema),
    defaultValues: { recipient_phone: '', template_key: '' },
  });

  React.useEffect(() => {
    if (!canManage) return;
    void (async () => {
      try {
        const raw = await apiClient<MaskedWhatsAppConfig | { data: MaskedWhatsAppConfig }>(
          '/api/v1/whatsapp-config',
        );
        setMasked(unwrap<MaskedWhatsAppConfig>(raw));
        setIsConfigured(true);
      } catch (err: unknown) {
        const errorObj = err as { error?: { code?: string }; status?: number };
        if (errorObj?.error?.code === 'WHATSAPP_CONFIG_NOT_FOUND' || errorObj?.status === 404) {
          setIsConfigured(false);
          setIsEditing(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [canManage]);

  React.useEffect(() => {
    if (!canManage || !isConfigured) return;
    void (async () => {
      try {
        const raw = await apiClient<{ data: TemplateRow[] } | TemplateRow[]>(
          '/api/v1/whatsapp-templates?status=approved',
        );
        setApprovedTemplates(unwrap<TemplateRow[]>(raw));
      } catch (err) {
        console.error('[WhatsAppPage.loadApprovedTemplates]', err);
      }
    })();
  }, [canManage, isConfigured, templatesReloadKey]);

  if (!canManage) return <NoPermissionState locale={locale} />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const raw = await apiClient<MaskedWhatsAppConfig | { data: MaskedWhatsAppConfig }>(
        '/api/v1/whatsapp-config',
        { method: 'PUT', body: JSON.stringify(values) },
      );
      setMasked(unwrap<MaskedWhatsAppConfig>(raw));
      setIsConfigured(true);
      setIsEditing(false);
      form.reset();
      toast.success(t('save.success'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('save.error'));
    }
  });

  async function handleDelete() {
    if (!window.confirm(t('delete.confirm'))) return;
    try {
      await apiClient('/api/v1/whatsapp-config', { method: 'DELETE' });
      setMasked(null);
      setIsConfigured(false);
      setIsEditing(true);
      toast.success(t('delete.success'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('delete.error'));
    }
  }

  const onTest = testForm.handleSubmit(async ({ recipient_phone, template_key }) => {
    setTestResult(null);
    try {
      await apiClient('/api/v1/whatsapp-config/test', {
        method: 'POST',
        body: JSON.stringify({ recipient_phone, template_key }),
        silent: true,
      });
      setTestResult({ kind: 'success', sentAt: new Date() });
    } catch (err: unknown) {
      const errorObj = err as {
        error?: {
          code?: string;
          message?: string;
          details?: { provider_error?: string; retry_after_seconds?: number };
        };
      };
      const code = errorObj?.error?.code;
      if (code === 'VERIFY_RATE_LIMIT_EXCEEDED' || code === 'RATE_LIMITED') {
        const retryAfterSec = errorObj?.error?.details?.retry_after_seconds ?? 3600;
        setTestResult({ kind: 'rate_limited', retryAfterMin: Math.ceil(retryAfterSec / 60) });
      } else {
        setTestResult({
          kind: 'failure',
          providerError:
            errorObj?.error?.details?.provider_error ?? errorObj?.error?.message ?? t('test.error'),
        });
      }
    }
  });

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2">
        <Link
          href={`/${locale}/settings/communications`}
          className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {tCommon('actions.backToCommunications')}
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      {isConfigured && !isEditing && masked && (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-text-primary">{t('summary.configured')}</p>
            </div>
            <span className="rounded-full bg-success-100 px-3 py-1 text-xs font-medium text-success-700">
              {tCommon('status.configured')}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <SummaryRow
              label={t('summary.accountSid')}
              value={masked.twilio_account_sid_mask}
              mono
            />
            <SummaryRow label={t('summary.authToken')} value={masked.twilio_auth_token_mask} mono />
            <SummaryRow
              label={t('summary.fromNumber')}
              value={masked.twilio_whatsapp_from_number}
              mono
              ltr
            />
            {masked.business_profile_id && (
              <SummaryRow
                label={t('summary.businessProfileId')}
                value={masked.business_profile_id}
                mono
              />
            )}
            <SummaryRow
              label={t('summary.webhookSecret')}
              value={masked.webhook_secret_mask}
              mono
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              className="text-destructive hover:bg-destructive/10"
            >
              {tCommon('actions.delete')}
            </Button>
            <Button type="button" onClick={() => setIsEditing(true)}>
              {tCommon('actions.update')}
            </Button>
          </div>
        </section>
      )}

      {isEditing && (
        <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              label={t('fields.accountSid')}
              hint={t('fields.accountSidHint')}
              error={form.formState.errors.twilio_account_sid?.message}
            >
              <PasswordInput
                id="twilio_account_sid"
                value={form.watch('twilio_account_sid')}
                onChange={(v) => form.setValue('twilio_account_sid', v, { shouldValidate: true })}
                placeholder="ACxxxxxxxxxxxx"
              />
            </FormField>
            <FormField
              label={t('fields.authToken')}
              hint={t('fields.authTokenHint')}
              error={form.formState.errors.twilio_auth_token?.message}
            >
              <PasswordInput
                id="twilio_auth_token"
                value={form.watch('twilio_auth_token')}
                onChange={(v) => form.setValue('twilio_auth_token', v, { shouldValidate: true })}
                placeholder="••••••••"
              />
            </FormField>
            <FormField
              label={t('fields.fromNumber')}
              hint={t('fields.fromNumberHint')}
              error={form.formState.errors.twilio_whatsapp_from_number?.message}
            >
              <Input
                id="twilio_whatsapp_from_number"
                type="text"
                dir="ltr"
                inputMode="tel"
                className="text-base font-mono"
                placeholder="+44XXXXXXXXX"
                {...form.register('twilio_whatsapp_from_number')}
              />
            </FormField>
            <FormField
              label={t('fields.businessProfileId')}
              hint={t('fields.businessProfileIdHint')}
            >
              <Input
                id="business_profile_id"
                type="text"
                dir="ltr"
                className="text-base font-mono"
                placeholder="BPxxxxxxxxxxxx"
                {...form.register('business_profile_id')}
              />
            </FormField>
            <FormField
              label={t('fields.webhookSecret')}
              hint={t('fields.webhookSecretHint')}
              error={form.formState.errors.webhook_secret?.message}
            >
              <PasswordInput
                id="webhook_secret"
                value={form.watch('webhook_secret')}
                onChange={(v) => form.setValue('webhook_secret', v, { shouldValidate: true })}
                placeholder="whsec_xxxxxxxx"
              />
            </FormField>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
            {isConfigured && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  form.reset();
                }}
              >
                {tCommon('actions.cancel')}
              </Button>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? tCommon('actions.saving') : tCommon('actions.save')}
            </Button>
          </div>
        </form>
      )}

      {isConfigured && !isEditing && (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text-primary">{t('test.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('test.description')}</p>

          {approvedTemplates.length === 0 ? (
            <p className="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
              {t('test.noApprovedTemplates')}
            </p>
          ) : (
            <form
              onSubmit={onTest}
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end"
            >
              <div>
                <Label htmlFor="recipient_phone">{t('test.recipientLabel')}</Label>
                <Input
                  id="recipient_phone"
                  type="text"
                  dir="ltr"
                  inputMode="tel"
                  className="mt-1 text-base font-mono"
                  placeholder={t('test.recipientPlaceholder')}
                  {...testForm.register('recipient_phone')}
                />
              </div>
              <div>
                <Label htmlFor="template_key">{t('test.templateLabel')}</Label>
                <select
                  id="template_key"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-base"
                  {...testForm.register('template_key')}
                >
                  <option value="">{t('test.templatePlaceholder')}</option>
                  {approvedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.template_key}>
                      {tpl.template_key} ({tpl.language_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 sm:flex sm:justify-end">
                <Button
                  type="submit"
                  disabled={testForm.formState.isSubmitting || approvedTemplates.length === 0}
                >
                  {testForm.formState.isSubmitting ? t('test.submitting') : t('test.button')}
                </Button>
              </div>
            </form>
          )}
          {testResult && <TestResultPanel result={testResult} t={t} />}
        </section>
      )}

      {isConfigured && !isEditing && (
        <>
          <TemplateList
            reloadKey={templatesReloadKey}
            onChange={() => setTemplatesReloadKey((k) => k + 1)}
          />
          <TemplateSubmitForm onCreated={() => setTemplatesReloadKey((k) => k + 1)} />
        </>
      )}
    </div>
  );
}

function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  ltr,
}: {
  label: string;
  value: string;
  mono?: boolean;
  ltr?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p
        className={`mt-0.5 text-sm text-text-primary ${mono ? 'font-mono' : ''}`}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function TestResultPanel({
  result,
  t,
}: {
  result: TestResult;
  t: ReturnType<typeof useTranslations>;
}) {
  if (result.kind === 'success') {
    return (
      <div className="mt-4 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800">
        {t('test.success')}
      </div>
    );
  }
  if (result.kind === 'rate_limited') {
    return (
      <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
        {t('test.rateLimited', { n: result.retryAfterMin })}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">{t('test.providerErrorTitle')}</p>
      <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-destructive">
        {result.providerError}
      </pre>
    </div>
  );
}
