'use client';

import { Loader2, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { Button, Input, Label, Checkbox } from '@school/ui';

import { apiClient } from '@/lib/api-client';

type Step = 'details' | 'preferences' | 'confirmation';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const invitationToken = searchParams?.get('token') ?? '';

  const [step, setStep] = React.useState<Step>('details');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [registrationComplete, setRegistrationComplete] = React.useState(false);

  /* ---- Form state ---- */
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  /* ---- Step 2: communication preferences ---- */
  const [commEmail, setCommEmail] = React.useState(true);
  const [commWhatsApp, setCommWhatsApp] = React.useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = React.useState('');
  const [sameAsPhone, setSameAsPhone] = React.useState(true);

  const locale = React.useMemo(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    return segments[0] ?? 'en';
  }, [pathname]);

  /* ---- Step 1 validation ---- */
  function validateStep1(): boolean {
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError(t('errors.nameRequired'));
      return false;
    }

    if (!email.trim()) {
      setError(t('errors.emailRequired'));
      return false;
    }

    if (password.length < 8) {
      setError(t('errors.passwordTooShort'));
      return false;
    }

    if (password !== confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return false;
    }

    return true;
  }

  function handleStep1Next(e: React.FormEvent) {
    e.preventDefault();
    if (validateStep1()) {
      setStep('preferences');
    }
  }

  function handleStep2Next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (commWhatsApp && !sameAsPhone && !whatsAppPhone.trim()) {
      setError(t('errors.whatsAppPhoneRequired'));
      return;
    }

    setStep('confirmation');
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        password,
        communication_preferences: {
          email: commEmail,
          whatsapp: commWhatsApp,
          whatsapp_phone: commWhatsApp
            ? sameAsPhone
              ? phone
              : whatsAppPhone
            : undefined,
        },
      };

      if (invitationToken) {
        body.invitation_token = invitationToken;
      }

      await apiClient('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
        skipAuth: true,
      });

      setRegistrationComplete(true);
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      setError(errorObj?.error?.message ?? t('errors.registrationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ---- Registration complete ---- */
  if (registrationComplete) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <CheckCircle className="mb-4 h-12 w-12 text-success-text" />
          <h2 className="text-xl font-semibold text-text-primary">
            {t('register.successTitle')}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {t('register.successDescription')}
          </p>
          <a href={`/${locale}/login`} className="mt-6">
            <Button>{t('backToLogin')}</Button>
          </a>
        </div>
      </div>
    );
  }

  /* ---- Step indicators ---- */
  const steps: { key: Step; label: string }[] = [
    { key: 'details', label: t('register.stepDetails') },
    { key: 'preferences', label: t('register.stepPreferences') },
    { key: 'confirmation', label: t('register.stepConfirmation') },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{t('register.title')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('register.description')}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                i <= currentStepIndex
                  ? 'bg-primary-700 text-white'
                  : 'bg-surface-secondary text-text-tertiary'
              }`}
            >
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-8 ${
                  i < currentStepIndex ? 'bg-primary-700' : 'bg-border'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {/* ---- Step 1: Details ---- */}
      {step === 'details' && (
        <form onSubmit={handleStep1Next} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">{t('register.firstName')}</Label>
              <Input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">{t('register.lastName')}</Label>
              <Input
                id="last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">{t('email')}</Label>
            <Input
              id="reg-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-phone">{t('register.phone')}</Label>
            <Input
              id="reg-phone"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder={t('register.phonePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">{t('password')}</Label>
            <Input
              id="reg-password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('register.passwordPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-confirm-password">{t('confirmPassword')}</Label>
            <Input
              id="reg-confirm-password"
              type="password"
              dir="ltr"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('register.confirmPasswordPlaceholder')}
            />
          </div>

          <Button type="submit" className="w-full">
            {t('register.continue')}
          </Button>

          <div className="text-center">
            <a
              href={`/${locale}/login`}
              className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
            >
              {t('register.alreadyHaveAccount')}
            </a>
          </div>
        </form>
      )}

      {/* ---- Step 2: Communication Preferences ---- */}
      {step === 'preferences' && (
        <form onSubmit={handleStep2Next} className="space-y-4">
          <p className="text-sm text-text-secondary">{t('register.preferencesDescription')}</p>

          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={commEmail}
                onCheckedChange={(checked) => setCommEmail(checked === true)}
              />
              <span className="text-sm text-text-primary">{t('register.commEmail')}</span>
            </label>

            <label className="flex items-center gap-3">
              <Checkbox
                checked={commWhatsApp}
                onCheckedChange={(checked) => setCommWhatsApp(checked === true)}
              />
              <span className="text-sm text-text-primary">{t('register.commWhatsApp')}</span>
            </label>
          </div>

          {commWhatsApp && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-secondary p-4">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={sameAsPhone}
                  onCheckedChange={(checked) => setSameAsPhone(checked === true)}
                />
                <span className="text-sm text-text-primary">
                  {t('register.sameAsPhone')}
                </span>
              </label>

              {!sameAsPhone && (
                <div className="space-y-2">
                  <Label htmlFor="whatsapp-phone">{t('register.whatsAppPhone')}</Label>
                  <Input
                    id="whatsapp-phone"
                    type="tel"
                    dir="ltr"
                    value={whatsAppPhone}
                    onChange={(e) => setWhatsAppPhone(e.target.value)}
                    required
                    placeholder={t('register.phonePlaceholder')}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStep('details');
                setError(null);
              }}
            >
              {t('register.back')}
            </Button>
            <Button type="submit" className="flex-1">
              {t('register.continue')}
            </Button>
          </div>
        </form>
      )}

      {/* ---- Step 3: Confirmation ---- */}
      {step === 'confirmation' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('register.confirmDescription')}</p>

          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary p-4">
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">{t('register.firstName')}</span>
              <span className="text-sm font-medium text-text-primary">{firstName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">{t('register.lastName')}</span>
              <span className="text-sm font-medium text-text-primary">{lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">{t('email')}</span>
              <span className="text-sm font-medium text-text-primary" dir="ltr">{email}</span>
            </div>
            {phone && (
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">{t('register.phone')}</span>
                <span className="text-sm font-medium text-text-primary" dir="ltr">{phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-text-secondary">{t('register.communication')}</span>
              <span className="text-sm font-medium text-text-primary">
                {[
                  commEmail ? t('register.commEmailShort') : null,
                  commWhatsApp ? t('register.commWhatsAppShort') : null,
                ]
                  .filter(Boolean)
                  .join(', ') || t('register.none')}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStep('preferences');
                setError(null);
              }}
            >
              {t('register.back')}
            </Button>
            <Button
              className="flex-1"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('register.creating')}
                </>
              ) : (
                t('register.createAccount')
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
