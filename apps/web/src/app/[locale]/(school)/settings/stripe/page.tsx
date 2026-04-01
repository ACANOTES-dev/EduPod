'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface StripeConfigResponse {
  id?: string;
  stripe_secret_key_masked?: string;
  stripe_publishable_key_masked?: string;
  stripe_webhook_secret_masked?: string;
  is_configured?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Password Input                                                            */
/* -------------------------------------------------------------------------- */

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pe-10 font-mono"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function StripeConfigPage() {
  const t = useTranslations('settings');

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isConfigured, setIsConfigured] = React.useState(false);

  // Masked values from server
  const [maskedSecretKey, setMaskedSecretKey] = React.useState<string>('');
  const [maskedPublishableKey, setMaskedPublishableKey] = React.useState<string>('');
  const [maskedWebhookSecret, setMaskedWebhookSecret] = React.useState<string>('');

  // New values being entered
  const [secretKey, setSecretKey] = React.useState('');
  const [publishableKey, setPublishableKey] = React.useState('');
  const [webhookSecret, setWebhookSecret] = React.useState('');

  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await apiClient<StripeConfigResponse>('/api/v1/stripe-config');
        if (data.is_configured) {
          setIsConfigured(true);
          setMaskedSecretKey(data.stripe_secret_key_masked ?? '');
          setMaskedPublishableKey(data.stripe_publishable_key_masked ?? '');
          setMaskedWebhookSecret(data.stripe_webhook_secret_masked ?? '');
        } else {
          setIsEditing(true);
        }
      } catch {
        // Not configured yet
        setIsEditing(true);
      } finally {
        setLoading(false);
      }
    }
    void fetchConfig();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!secretKey.trim() || !publishableKey.trim() || !webhookSecret.trim()) {
      toast.error(t('stripeAllFieldsRequired'));
      return;
    }

    setSaving(true);
    try {
      const data = await apiClient<StripeConfigResponse>('/api/v1/stripe-config', {
        method: 'PUT',
        body: JSON.stringify({
          stripe_secret_key: secretKey,
          stripe_publishable_key: publishableKey,
          stripe_webhook_secret: webhookSecret,
        }),
      });

      setIsConfigured(true);
      setIsEditing(false);
      setMaskedSecretKey(data.stripe_secret_key_masked ?? '****');
      setMaskedPublishableKey(data.stripe_publishable_key_masked ?? '****');
      setMaskedWebhookSecret(data.stripe_webhook_secret_masked ?? '****');

      // Clear entered values
      setSecretKey('');
      setPublishableKey('');
      setWebhookSecret('');

      toast.success(t('stripeSaved'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-text-primary">{t('stripe')}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t('stripeDescription')}</p>

      {/* Current config summary */}
      {isConfigured && !isEditing && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('stripeConfigured')}</p>
              <p className="mt-0.5 text-xs text-text-tertiary">{t('stripeConfiguredDesc')}</p>
            </div>
            <span className="self-start rounded-full bg-success-100 px-3 py-1 text-xs font-medium text-success-700 sm:self-auto">
              {t('configured')}
            </span>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <p className="text-xs text-text-tertiary">{t('stripeSecretKey')}</p>
              <p className="mt-0.5 font-mono text-sm text-text-primary">{maskedSecretKey}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('stripePublishableKey')}</p>
              <p className="mt-0.5 font-mono text-sm text-text-primary">{maskedPublishableKey}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{t('stripeWebhookSecret')}</p>
              <p className="mt-0.5 font-mono text-sm text-text-primary">{maskedWebhookSecret}</p>
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              {t('stripeUpdate')}
            </Button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="mt-6 rounded-2xl border border-border bg-surface p-6"
        >
          {isConfigured && (
            <div className="mb-4 rounded-xl border border-warning-200 bg-warning-50 p-3">
              <p className="text-sm text-warning-800">{t('stripeUpdateWarning')}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Secret Key */}
            <div className="space-y-2">
              <Label htmlFor="stripe-secret-key">{t('stripeSecretKey')}</Label>
              <p className="text-xs text-text-tertiary">{t('stripeSecretKeyHint')}</p>
              <PasswordInput
                id="stripe-secret-key"
                value={secretKey}
                onChange={setSecretKey}
                placeholder="sk_live_..."
              />
            </div>

            {/* Publishable Key */}
            <div className="space-y-2">
              <Label htmlFor="stripe-publishable-key">{t('stripePublishableKey')}</Label>
              <p className="text-xs text-text-tertiary">{t('stripePublishableKeyHint')}</p>
              <Input
                id="stripe-publishable-key"
                type="text"
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                placeholder="pk_live_..."
                className="font-mono"
                autoComplete="off"
              />
            </div>

            {/* Webhook Secret */}
            <div className="space-y-2">
              <Label htmlFor="stripe-webhook-secret">{t('stripeWebhookSecret')}</Label>
              <p className="text-xs text-text-tertiary">{t('stripeWebhookSecretHint')}</p>
              <PasswordInput
                id="stripe-webhook-secret"
                value={webhookSecret}
                onChange={setWebhookSecret}
                placeholder="whsec_..."
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {isConfigured && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setSecretKey('');
                  setPublishableKey('');
                  setWebhookSecret('');
                }}
              >
                {t('cancel')}
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          </div>
        </form>
      )}

      {/* Security note */}
      <div className="mt-4 rounded-xl border border-border bg-surface-secondary p-4">
        <p className="text-xs text-text-tertiary">{t('stripeSecurityNote')}</p>
      </div>
    </div>
  );
}
