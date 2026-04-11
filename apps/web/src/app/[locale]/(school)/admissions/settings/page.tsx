'use client';

import { ArrowLeft, CreditCard, DollarSign, Settings2, Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdmissionsSettings {
  requireApprovalForAcceptance: boolean;
  upfront_percentage: number;
  payment_window_days: number;
  max_application_horizon_years: number;
  allow_cash: boolean;
  allow_bank_transfer: boolean;
  bank_iban: string | null;
  require_override_approval_role: 'school_owner' | 'school_principal';
  cashPaymentDeadlineDays: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdmissionsSettingsPage() {
  const t = useTranslations('admissionsSettings');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [settings, setSettings] = React.useState<AdmissionsSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    async function load() {
      try {
        const raw = await apiClient<AdmissionsSettings | { data: AdmissionsSettings }>(
          '/api/v1/settings/admissions',
        );
        setSettings(unwrap(raw) as AdmissionsSettings);
      } catch (err) {
        console.error('[AdmissionsSettingsPage]', err);
        toast.error(t('loadError'));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [t]);

  const update = React.useCallback(
    <K extends keyof AdmissionsSettings>(key: K, value: AdmissionsSettings[K]) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const handleSave = React.useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const raw = await apiClient<AdmissionsSettings | { data: AdmissionsSettings }>(
        '/api/v1/settings/admissions',
        {
          method: 'PATCH',
          body: JSON.stringify(settings),
        },
      );
      setSettings(unwrap(raw) as AdmissionsSettings);
      toast.success(t('saved'));
    } catch (err) {
      console.error('[AdmissionsSettingsPage]', err);
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  }, [settings, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!settings) {
    return <div className="py-16 text-center text-sm text-text-tertiary">{t('loadError')}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl pb-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Link
          href={`/${locale}/admissions`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── Payment Settings ──────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('payment.title')}</h2>
              <p className="text-xs text-text-tertiary">{t('payment.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="upfront-pct">{t('payment.upfrontPercentage')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="upfront-pct"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.upfront_percentage}
                    onChange={(e) => update('upfront_percentage', Number(e.target.value))}
                    className="w-full sm:w-28"
                  />
                  <span className="text-sm text-text-tertiary">%</span>
                </div>
                <p className="text-xs text-text-tertiary">{t('payment.upfrontPercentageHint')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-window">{t('payment.paymentWindow')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="payment-window"
                    type="number"
                    min={1}
                    value={settings.payment_window_days}
                    onChange={(e) => update('payment_window_days', Number(e.target.value))}
                    className="w-full sm:w-28"
                  />
                  <span className="text-sm text-text-tertiary">{t('payment.days')}</span>
                </div>
                <p className="text-xs text-text-tertiary">{t('payment.paymentWindowHint')}</p>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                {t('payment.methodsTitle')}
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('payment.stripeOnline')}
                    </p>
                    <p className="text-xs text-text-tertiary">{t('payment.stripeOnlineHint')}</p>
                  </div>
                  <Link
                    href={`/${locale}/settings/stripe`}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    {t('payment.configureStripe')}
                  </Link>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('payment.allowCash')}
                    </p>
                    <p className="text-xs text-text-tertiary">{t('payment.allowCashHint')}</p>
                  </div>
                  <Switch
                    checked={settings.allow_cash}
                    onCheckedChange={(v) => update('allow_cash', v)}
                  />
                </div>

                {settings.allow_cash && (
                  <div className="ms-4 space-y-1.5 border-s-2 border-border ps-4">
                    <Label htmlFor="cash-deadline">{t('payment.cashDeadline')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="cash-deadline"
                        type="number"
                        min={1}
                        value={settings.cashPaymentDeadlineDays}
                        onChange={(e) => update('cashPaymentDeadlineDays', Number(e.target.value))}
                        className="w-full sm:w-28"
                      />
                      <span className="text-sm text-text-tertiary">{t('payment.days')}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('payment.allowBankTransfer')}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {t('payment.allowBankTransferHint')}
                    </p>
                  </div>
                  <Switch
                    checked={settings.allow_bank_transfer}
                    onCheckedChange={(v) => update('allow_bank_transfer', v)}
                  />
                </div>

                {settings.allow_bank_transfer && (
                  <div className="ms-4 space-y-1.5 border-s-2 border-border ps-4">
                    <Label htmlFor="bank-iban">{t('payment.bankIban')}</Label>
                    <Input
                      id="bank-iban"
                      type="text"
                      value={settings.bank_iban ?? ''}
                      onChange={(e) => update('bank_iban', e.target.value || null)}
                      placeholder="IE29 AIBK 9311 5212 3456 78"
                      dir="ltr"
                      className="font-mono"
                    />
                    <p className="text-xs text-text-tertiary">{t('payment.bankIbanHint')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Application Rules ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('rules.title')}</h2>
              <p className="text-xs text-text-tertiary">{t('rules.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="max-horizon">{t('rules.maxHorizon')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max-horizon"
                  type="number"
                  min={0}
                  max={5}
                  value={settings.max_application_horizon_years}
                  onChange={(e) => update('max_application_horizon_years', Number(e.target.value))}
                  className="w-full sm:w-28"
                />
                <span className="text-sm text-text-tertiary">{t('rules.years')}</span>
              </div>
              <p className="text-xs text-text-tertiary">{t('rules.maxHorizonHint')}</p>
            </div>
          </div>
        </section>

        {/* ─── Approval & Override ───────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('approval.title')}</h2>
              <p className="text-xs text-text-tertiary">{t('approval.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('approval.requireApproval')}
                </p>
                <p className="text-xs text-text-tertiary">{t('approval.requireApprovalHint')}</p>
              </div>
              <Switch
                checked={settings.requireApprovalForAcceptance}
                onCheckedChange={(v) => update('requireApprovalForAcceptance', v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('approval.overrideRole')}</Label>
              <Select
                value={settings.require_override_approval_role}
                onValueChange={(v) =>
                  update('require_override_approval_role', v as 'school_owner' | 'school_principal')
                }
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school_owner">{t('approval.roleOwner')}</SelectItem>
                  <SelectItem value="school_principal">{t('approval.rolePrincipal')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">{t('approval.overrideRoleHint')}</p>
            </div>
          </div>
        </section>

        {/* ─── Stripe Link ──────────────────────────────────────────── */}
        <section className="rounded-2xl border border-dashed border-border bg-surface-secondary p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-text-primary">{t('stripe.title')}</h2>
              <p className="text-xs text-text-tertiary">{t('stripe.subtitle')}</p>
            </div>
            <Link
              href={`/${locale}/settings/stripe`}
              className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary"
            >
              {t('stripe.manage')}
            </Link>
          </div>
        </section>

        {/* ─── Save button ──────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  );
}
