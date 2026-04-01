'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { apiClient, setAccessToken } from '@/lib/api-client';
import { useAuth, type AuthUser } from '@/providers/auth-provider';

export default function MfaVerifyPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const pathname = usePathname();

  const sessionToken = searchParams?.get('session') ?? '';

  const locale = React.useMemo(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    return segments[0] ?? 'en';
  }, [pathname]);

  const [code, setCode] = React.useState('');
  const [useRecovery, setUseRecovery] = React.useState(false);
  const [recoveryCode, setRecoveryCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const body: Record<string, string> = {
        mfa_session_token: sessionToken,
      };

      if (useRecovery) {
        body.recovery_code = recoveryCode;
      } else {
        body.mfa_code = code;
      }

      const data = await apiClient<{
        data: { access_token: string; user: AuthUser };
      }>('/api/v1/auth/mfa-verify', {
        method: 'POST',
        body: JSON.stringify(body),
        skipAuth: true,
      });

      if (data?.data?.access_token) {
        setAccessToken(data.data.access_token);
        await refreshUser();

        router.replace(`/${locale}/dashboard`);
      }
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      setError(errorObj?.error?.message ?? t('errors.invalidMfaCode'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <ShieldCheck className="mb-3 h-10 w-10 text-primary-600" />
        <h2 className="text-xl font-semibold text-text-primary">{t('mfa.title')}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {useRecovery ? t('mfa.enterRecoveryCode') : t('mfa.enterCode')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger-text">
            {error}
          </div>
        )}

        {!useRecovery ? (
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{t('mfa.code')}</Label>
            <Input
              id="mfa-code"
              type="text"
              dir="ltr"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              autoComplete="one-time-code"
              className="text-center text-lg tracking-[0.5em]"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="recovery-code">{t('mfa.recoveryCode')}</Label>
            <Input
              id="recovery-code"
              type="text"
              dir="ltr"
              placeholder={t('mfa.recoveryCodePlaceholder')}
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
              autoFocus
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('mfa.verifying')}
            </>
          ) : (
            t('mfa.verify')
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setError(null);
            setCode('');
            setRecoveryCode('');
          }}
          className="w-full text-center text-sm text-primary-600 hover:text-primary-700 hover:underline"
        >
          {useRecovery ? t('mfa.useAuthenticator') : t('mfa.useRecoveryCode')}
        </button>
      </form>

      <div className="mt-6 text-center">
        <a
          href={`/${locale}/login`}
          className="text-sm text-text-secondary hover:text-text-primary hover:underline"
        >
          {t('mfa.backToLogin')}
        </a>
      </div>
    </div>
  );
}
