'use client';

import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { useAuth } from '@/providers/auth-provider';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { login, user } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaRequired, setMfaRequired] = React.useState(false);
  const [_mfaSessionToken, setMfaSessionToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Sanitise redirect: only allow relative paths to prevent open-redirect attacks
  const rawRedirect = searchParams.get('redirect') ?? null;
  const redirectTo = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : null;

  // Extract locale from pathname (e.g. /en/login -> en)
  const locale = React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments[0] ?? 'en';
  }, [pathname]);

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      const memberships = user.memberships ?? [];
      const activeMemberships = memberships.filter(
        (m) => m.membership_status === 'active',
      );

      if (redirectTo) {
        router.replace(redirectTo);
      } else if (activeMemberships.length > 1) {
        router.replace(`/${locale}/select-school`);
      } else {
        router.replace(`/${locale}/dashboard`);
      }
    }
  }, [user, router, redirectTo, locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await login(email, password, mfaRequired ? mfaCode : undefined);

      if (result.mfa_required) {
        setMfaRequired(true);
        setMfaSessionToken(result.mfa_session_token ?? null);
        setIsSubmitting(false);
        return;
      }

      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      // success — useEffect above will handle redirect
    } catch {
      setError(t('errors.unknown'));
      setIsSubmitting(false);
    }
  }

  function getErrorTranslation(errorMessage: string): string {
    const errorMap: Record<string, string> = {
      'Invalid credentials': t('errors.invalidCredentials'),
      'Account suspended': t('errors.accountSuspended'),
      'Too many attempts': t('errors.bruteForce'),
      'MFA code required': t('errors.mfaRequired'),
      'Invalid MFA code': t('errors.invalidMfaCode'),
    };
    return errorMap[errorMessage] ?? errorMessage;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{t('login')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('loginDescription')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error message */}
        {error && (
          <div className="rounded-xl border border-danger-border bg-danger-subtle p-3 text-sm text-danger-text">
            {getErrorTranslation(error)}
          </div>
        )}

        {!mfaRequired ? (
          <>
            {/* Email */}
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

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  tabIndex={-1}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* MFA code input */
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{t('mfa.code')}</Label>
            <p className="text-sm text-text-secondary">{t('mfa.enterCode')}</p>
            <Input
              id="mfa-code"
              type="text"
              dir="ltr"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              autoComplete="one-time-code"
            />
          </div>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('loggingIn')}
            </>
          ) : mfaRequired ? (
            t('mfa.verify')
          ) : (
            t('login')
          )}
        </Button>

        {/* Back to credentials from MFA */}
        {mfaRequired && (
          <button
            type="button"
            onClick={() => {
              setMfaRequired(false);
              setMfaCode('');
              setMfaSessionToken(null);
              setError(null);
            }}
            className="w-full text-center text-sm text-text-secondary hover:text-text-primary"
          >
            {t('mfa.backToLogin')}
          </button>
        )}
      </form>

      {/* Footer links */}
      {!mfaRequired && (
        <div className="mt-6 text-center">
          <a
            href={`/${locale}/reset-password`}
            className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
          >
            {t('forgotPassword')}
          </a>
        </div>
      )}
    </div>
  );
}
