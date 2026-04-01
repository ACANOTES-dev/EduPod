'use client';

import { Loader2, CheckCircle } from 'lucide-react';
import { useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { apiClient } from '@/lib/api-client';

type Step = 'request' | 'confirm' | 'success';

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tokenFromUrl = searchParams?.get('token') ?? null;

  const [step, setStep] = React.useState<Step>(tokenFromUrl ? 'confirm' : 'request');
  const [email, setEmail] = React.useState('');
  const [token, setToken] = React.useState(tokenFromUrl ?? '');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  /* ---- Step 1: Request reset email ---- */
  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await apiClient('/api/v1/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
      });
      // Always show success (don't reveal whether email exists)
      setStep('confirm');
    } catch {
      // Still show the confirm step — don't reveal whether the email exists
      setStep('confirm');
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ---- Step 2: Confirm reset with token + new password ---- */
  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t('errors.passwordMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('errors.passwordTooShort'));
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
        skipAuth: true,
      });
      setStep('success');
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      setError(errorObj?.error?.message ?? t('errors.resetFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const locale = React.useMemo(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    return segments[0] ?? 'en';
  }, [pathname]);

  /* ---- Render: Step 1 — Enter email ---- */
  if (step === 'request') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-text-primary">{t('resetPassword')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('resetPasswordDescription')}</p>
        </div>

        <form onSubmit={handleRequestReset} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger-text">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t('sending')}
              </>
            ) : (
              t('sendResetLink')
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a
            href={`/${locale}/login`}
            className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
          >
            {t('backToLogin')}
          </a>
        </div>
      </div>
    );
  }

  /* ---- Render: Step 2 — Enter token + new password ---- */
  if (step === 'confirm') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-text-primary">{t('resetPassword')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('resetPasswordConfirmDescription')}</p>
        </div>

        <form onSubmit={handleConfirmReset} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger-text">
              {error}
            </div>
          )}

          {/* Show token field only if not pre-filled from URL */}
          {!tokenFromUrl && (
            <div className="space-y-2">
              <Label htmlFor="token">{t('resetToken')}</Label>
              <Input
                id="token"
                type="text"
                dir="ltr"
                placeholder={t('resetTokenPlaceholder')}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">{t('newPassword')}</Label>
            <Input
              id="new-password"
              type="password"
              dir="ltr"
              placeholder={t('newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus={!!tokenFromUrl}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
            <Input
              id="confirm-password"
              type="password"
              dir="ltr"
              placeholder={t('confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t('resetting')}
              </>
            ) : (
              t('resetPassword')
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a
            href={`/${locale}/login`}
            className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
          >
            {t('backToLogin')}
          </a>
        </div>
      </div>
    );
  }

  /* ---- Render: Step 3 — Success ---- */
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <CheckCircle className="mb-4 h-12 w-12 text-success-text" />
        <h2 className="text-xl font-semibold text-text-primary">{t('resetSuccess')}</h2>
        <p className="mt-2 text-sm text-text-secondary">{t('resetSuccessDescription')}</p>
        <a href={`/${locale}/login`} className="mt-6">
          <Button>{t('backToLogin')}</Button>
        </a>
      </div>
    </div>
  );
}
