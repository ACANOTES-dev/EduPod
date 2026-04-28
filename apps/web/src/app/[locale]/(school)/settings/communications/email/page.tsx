'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type MaskedEmailConfig,
  type TestEmailDto,
  type UpsertEmailConfigDto,
  testEmailSchema,
  upsertEmailConfigSchema,
} from '@school/shared';
import { Button, Input, Label, toast } from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';

import { NoPermissionState } from '../_components/no-permission-state';
import { PasswordInput } from '../_components/password-input';

import { DomainVerificationCard } from './_components/domain-verification-card';

type TestResult =
  | { kind: 'success'; sentAt: Date }
  | { kind: 'failure'; providerError: string; hint?: string }
  | { kind: 'rate_limited'; retryAfterMin: number };

export default function EmailConfigPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const t = useTranslations('settings.communications.email');
  const tCommon = useTranslations('settings.communications');
  const { hasAnyRole } = useRoleCheck();

  const canManage = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');

  const [masked, setMasked] = React.useState<MaskedEmailConfig | null>(null);
  const [isConfigured, setIsConfigured] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  const form = useForm<UpsertEmailConfigDto>({
    resolver: zodResolver(upsertEmailConfigSchema),
    defaultValues: {
      resend_api_key: '',
      from_email: '',
      from_name: '',
      reply_to_email: '',
      webhook_secret: '',
    },
  });

  const testForm = useForm<TestEmailDto>({
    resolver: zodResolver(testEmailSchema),
    defaultValues: { recipient_email: '' },
  });

  React.useEffect(() => {
    if (!canManage) return;
    void (async () => {
      try {
        // silent:true — 404 is the expected "no config yet" state. We map it
        // into the empty form below; other failures still surface a toast.
        const raw = await apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>(
          '/api/v1/email-config',
          { silent: true },
        );
        const config = unwrap<MaskedEmailConfig>(raw);
        setMasked(config);
        setIsConfigured(true);
      } catch (err: unknown) {
        const errorObj = err as { error?: { code?: string }; status?: number };
        if (errorObj?.error?.code === 'EMAIL_CONFIG_NOT_FOUND' || errorObj?.status === 404) {
          setIsConfigured(false);
          setIsEditing(true);
        } else {
          toast.error(t('save.error'));
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [canManage, t]);

  if (!canManage) return <NoPermissionState locale={locale} />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const raw = await apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>(
        '/api/v1/email-config',
        {
          method: 'PUT',
          body: JSON.stringify(values),
        },
      );
      const config = unwrap<MaskedEmailConfig>(raw);
      setMasked(config);
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
      await apiClient('/api/v1/email-config', { method: 'DELETE' });
      setMasked(null);
      setIsConfigured(false);
      setIsEditing(true);
      toast.success(t('delete.success'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('delete.error'));
    }
  }

  const onTest = testForm.handleSubmit(async ({ recipient_email }) => {
    setTestResult(null);
    try {
      await apiClient('/api/v1/email-config/test', {
        method: 'POST',
        body: JSON.stringify({ recipient_email }),
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
        <SkeletonBlock />
        <SkeletonBlock />
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
              {masked.key_last_rotated_at && (
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {t('summary.rotated', {
                    ts: new Date(masked.key_last_rotated_at).toLocaleDateString(locale),
                  })}
                </p>
              )}
            </div>
            <span className="rounded-full bg-success-100 px-3 py-1 text-xs font-medium text-success-700">
              {tCommon('status.configured')}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <SummaryRow label={t('summary.apiKey')} value={masked.resend_api_key_mask} mono />
            <SummaryRow label={t('summary.fromEmail')} value={masked.from_email} />
            <SummaryRow label={t('summary.replyTo')} value={masked.reply_to_email ?? '—'} />
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
            <Button
              type="button"
              onClick={() => {
                // Pre-fill non-secret fields from the masked config so the
                // Update flow doesn't blank them out and overwrite saved
                // values with empty strings on a partial save. Secrets stay
                // blank — leaving them blank means "don't change". A separate
                // useEffect on submit ensures empty secrets fall back to the
                // saved-on-server values rather than overwriting them.
                form.reset({
                  resend_api_key: '',
                  from_email: masked.from_email,
                  from_name: masked.from_name ?? '',
                  reply_to_email: masked.reply_to_email ?? '',
                  webhook_secret: '',
                });
                setIsEditing(true);
              }}
            >
              {tCommon('actions.update')}
            </Button>
          </div>
        </section>
      )}

      {isEditing && (
        <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-6">
          {isConfigured && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800"
            >
              {t('update.secretsRequiredNotice')}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              label={t('fields.resendApiKey')}
              hint={t('fields.resendApiKeyHint')}
              error={form.formState.errors.resend_api_key?.message}
              fieldId="resend_api_key"
            >
              <PasswordInput
                id="resend_api_key"
                value={form.watch('resend_api_key')}
                onChange={(v) => form.setValue('resend_api_key', v, { shouldValidate: true })}
                placeholder="re_xxxxxxxxxxxx"
                aria-invalid={form.formState.errors.resend_api_key ? true : undefined}
                aria-describedby={
                  form.formState.errors.resend_api_key ? 'resend_api_key-error' : undefined
                }
              />
            </FormField>

            <FormField
              label={t('fields.fromEmail')}
              hint={t('fields.fromEmailHint')}
              error={form.formState.errors.from_email?.message}
              fieldId="from_email"
            >
              <Input
                id="from_email"
                type="email"
                dir="ltr"
                className="text-base"
                placeholder="noreply@school.example"
                aria-invalid={form.formState.errors.from_email ? true : undefined}
                aria-describedby={form.formState.errors.from_email ? 'from_email-error' : undefined}
                {...form.register('from_email')}
              />
            </FormField>

            <FormField
              label={t('fields.fromName')}
              hint={t('fields.fromNameHint')}
              fieldId="from_name"
            >
              <Input
                id="from_name"
                type="text"
                className="text-base"
                {...form.register('from_name')}
              />
            </FormField>

            <FormField
              label={t('fields.replyToEmail')}
              hint={t('fields.replyToEmailHint')}
              fieldId="reply_to_email"
            >
              <Input
                id="reply_to_email"
                type="email"
                dir="ltr"
                className="text-base"
                {...form.register('reply_to_email')}
              />
            </FormField>

            <FormField
              label={t('fields.webhookSecret')}
              hint={t('fields.webhookSecretHint')}
              error={form.formState.errors.webhook_secret?.message}
              fieldId="webhook_secret"
              fullWidth
            >
              <PasswordInput
                id="webhook_secret"
                value={form.watch('webhook_secret')}
                onChange={(v) => form.setValue('webhook_secret', v, { shouldValidate: true })}
                placeholder="whsec_xxxxxxxx"
                aria-invalid={form.formState.errors.webhook_secret ? true : undefined}
                aria-describedby={
                  form.formState.errors.webhook_secret ? 'webhook_secret-error' : undefined
                }
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
          <form onSubmit={onTest} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="recipient_email">{t('test.recipientLabel')}</Label>
              <Input
                id="recipient_email"
                type="email"
                dir="ltr"
                className="mt-1 text-base"
                placeholder={t('test.recipientPlaceholder')}
                {...testForm.register('recipient_email')}
              />
            </div>
            <Button type="submit" disabled={testForm.formState.isSubmitting}>
              {testForm.formState.isSubmitting ? t('test.submitting') : t('test.button')}
            </Button>
          </form>
          {testResult && <TestResultPanel result={testResult} t={t} />}
        </section>
      )}

      {isConfigured && !isEditing && <DomainVerificationCard />}
    </div>
  );
}

function FormField({
  label,
  hint,
  error,
  fullWidth,
  fieldId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  fullWidth?: boolean;
  /** Used to derive the error span's id for aria-describedby wiring on screen readers. */
  fieldId?: string;
  children: React.ReactNode;
}) {
  const errorId = fieldId && error ? `${fieldId}-error` : undefined;
  return (
    <div className={`space-y-1 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <Label htmlFor={fieldId}>{label}</Label>
      {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
      {children}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-0.5 text-sm text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</p>
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
      {result.hint && <p className="mt-2 text-xs text-text-secondary">{result.hint}</p>}
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-secondary" />
  );
}
