'use client';

import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CommunicationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  preferred_language: string;
}

/* -------------------------------------------------------------------------- */
/* Communication Preferences Page                                              */
/* -------------------------------------------------------------------------- */

export default function CommunicationPreferencesPage() {
  const t = useTranslations();

  const [prefs, setPrefs] = React.useState<CommunicationPreferences>({
    email: true,
    sms: false,
    push: false,
    preferred_language: 'en',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /* ---- Load current preferences on mount ---- */
  React.useEffect(() => {
    let cancelled = false;
    async function loadPrefs() {
      try {
        const data = await apiClient<{
          data: {
            communication?: {
              email?: boolean;
              sms?: boolean;
              push?: boolean;
              preferred_language?: string;
            };
          };
        }>('/api/v1/me/preferences');
        if (!cancelled && data?.data?.communication) {
          const comm = data.data.communication;
          setPrefs({
            email: comm.email ?? true,
            sms: comm.sms ?? false,
            push: comm.push ?? false,
            preferred_language: comm.preferred_language ?? 'en',
          });
        }
      } catch {
        // Silently fall back to defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPrefs();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Save handler ---- */
  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await apiClient('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ communication: prefs }),
      });
      setMessage({ type: 'success', text: t('communication.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('communication.saveError') });
    } finally {
      setSaving(false);
    }
  }

  function toggle(field: keyof Pick<CommunicationPreferences, 'email' | 'sms' | 'push'>) {
    setPrefs((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-text-tertiary">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      {/* Page title */}
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        {t('communication.title')}
      </h1>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{t('communication.channels')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('communication.description')}</p>
        </div>

        {/* Email */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="comm-email"
            checked={prefs.email}
            onCheckedChange={() => toggle('email')}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="comm-email" className="text-sm font-medium cursor-pointer">
              {t('communication.email')}
            </Label>
            <p className="text-xs text-text-tertiary">{t('communication.emailDescription')}</p>
          </div>
        </div>

        {/* SMS */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="comm-sms"
            checked={prefs.sms}
            onCheckedChange={() => toggle('sms')}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="comm-sms" className="text-sm font-medium cursor-pointer">
              {t('communication.sms')}
            </Label>
            <p className="text-xs text-text-tertiary">{t('communication.smsDescription')}</p>
          </div>
        </div>

        {/* Push */}
        <div className="flex items-start gap-3">
          <Checkbox
            id="comm-push"
            checked={prefs.push}
            onCheckedChange={() => toggle('push')}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="comm-push" className="text-sm font-medium cursor-pointer">
              {t('communication.push')}
            </Label>
            <p className="text-xs text-text-tertiary">{t('communication.pushDescription')}</p>
          </div>
        </div>

        {/* Preferred language */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <Label htmlFor="comm-language">{t('communication.preferredLanguage')}</Label>
          <Select
            value={prefs.preferred_language}
            onValueChange={(val) => setPrefs((prev) => ({ ...prev, preferred_language: val }))}
          >
            <SelectTrigger id="comm-language" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('profile.localeEn')}</SelectItem>
              <SelectItem value="ar">{t('profile.localeAr')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {message && (
          <p
            className={
              message.type === 'success' ? 'text-sm text-success-text' : 'text-sm text-danger-text'
            }
          >
            {message.text}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('communication.saving') : t('communication.save')}
          </Button>
        </div>
      </section>
    </div>
  );
}
