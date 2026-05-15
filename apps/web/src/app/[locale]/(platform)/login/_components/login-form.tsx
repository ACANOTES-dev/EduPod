'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { loginSchema, type LoginDto } from '@school/shared';
import { Button, Input, Label } from '@school/ui';

import { useAuth } from '@/providers/auth-provider';

type PlatformLoginFormValues = Pick<LoginDto, 'email' | 'password' | 'mfa_code'>;

export function PlatformLoginForm() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) ?? 'en';
  const { login } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [mfaRequired, setMfaRequired] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<PlatformLoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      mfa_code: undefined,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: PlatformLoginFormValues) {
    setFormError(null);

    const result = await login(
      values.email,
      values.password,
      mfaRequired ? values.mfa_code : undefined,
    );

    if (result.mfa_required) {
      setMfaRequired(true);
      return;
    }

    if (result.error) {
      setFormError(
        result.error === 'Invalid credentials' || result.error === 'Invalid email or password'
          ? 'Invalid email or password'
          : result.error,
      );
      return;
    }

    router.replace(`/${locale}/admin`);
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
      </div>

      {formError ? (
        <div className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {formError}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="platform-email">Email</Label>
          <Input
            id="platform-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
          {form.formState.errors.email ? (
            <p className="text-sm text-danger-text">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="platform-password">Password</Label>
          <div className="relative">
            <Input
              id="platform-password"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              className="pe-10"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.formState.errors.password ? (
            <p className="text-sm text-danger-text">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {mfaRequired ? (
          <div className="space-y-2">
            <Label htmlFor="platform-mfa">Code</Label>
            <Input
              id="platform-mfa"
              type="text"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              aria-invalid={Boolean(form.formState.errors.mfa_code)}
              {...form.register('mfa_code')}
            />
            {form.formState.errors.mfa_code ? (
              <p className="text-sm text-danger-text">{form.formState.errors.mfa_code.message}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button type="submit" className="mt-6 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            Signing in
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  );
}
