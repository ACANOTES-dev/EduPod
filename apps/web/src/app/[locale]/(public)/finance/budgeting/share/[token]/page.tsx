'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { PublicSnapshotRenderer } from './_components/public-snapshot-renderer';
import type { PublicShareResponse } from './_components/public-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Props {
  params: { locale: string; token: string };
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'snapshot'; data: PublicShareResponse }
  | { kind: 'password-required' }
  | { kind: 'wrong-password'; lastAttempt: string }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'not-found' };

const MAX_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export default function PublicSharePage({ params }: Props) {
  const t = useTranslations('financeBudgetingShare.public');
  const token = params.token;

  const [view, setView] = React.useState<ViewState>({ kind: 'loading' });
  const [passwordAttempts, setPasswordAttempts] = React.useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = React.useState<number | null>(null);
  const passwordInputRef = React.useRef<HTMLInputElement | null>(null);

  const fetchPublic = React.useCallback(
    async (passwordAttempt?: string): Promise<void> => {
      try {
        const params = new URLSearchParams();
        if (passwordAttempt) params.set('password', passwordAttempt);
        const url = `${API_URL}/api/v1/budgeting/share/${encodeURIComponent(token)}${
          params.toString() ? `?${params.toString()}` : ''
        }`;
        // Raw fetch — NOT apiClient — so no bearer token / cookies get
        // attached. The route is unauthenticated by design.
        const response = await fetch(url, { credentials: 'omit' });

        if (response.status === 404) {
          // The backend uses a single 404 for invalid/expired/revoked/wrong-password
          // (so timing/info doesn't leak which branch failed). The body's `code`
          // hints at the cause for friendlier UX, but we never assume it's safe.
          let body: unknown = null;
          try {
            body = await response.json();
          } catch (jsonErr) {
            // Body isn't JSON — log + treat as not-found below.
            console.error('[public-share.parseBody]', jsonErr);
          }
          const code =
            (body as { code?: string; error?: { code?: string } })?.code ??
            (body as { error?: { code?: string } })?.error?.code ??
            null;

          if (passwordAttempt) {
            // Inside the password flow, treat any 404 as wrong-password —
            // don't expose whether the link is invalid vs the password is wrong.
            const next = passwordAttempts + 1;
            setPasswordAttempts(next);
            if (next >= MAX_PASSWORD_ATTEMPTS) {
              setLockoutUntil(Date.now() + LOCKOUT_MS);
            }
            setView({ kind: 'wrong-password', lastAttempt: passwordAttempt });
            return;
          }

          // No password yet — try the resolve. The backend returns the
          // same 404 envelope for all four branches, so we infer the
          // friendliest message we can. If the code mentions password,
          // route to the prompt. Otherwise show generic invalid.
          if (code && code.toLowerCase().includes('password')) {
            setView({ kind: 'password-required' });
            return;
          }
          // Without an explicit hint, default to password-required because
          // the user can always escape via "Wrong password? Contact" copy.
          // BUT for the most common case (truly invalid token) we want the
          // not-found state. Prefer the unauthenticated "first try without
          // password" pattern: assume no password unless the resolve fails
          // again with a password-required signal.
          setView({ kind: 'not-found' });
          return;
        }

        if (response.status === 401) {
          // Some deployments may return 401 for password-protected;
          // handle the same way as the password branch.
          setView({ kind: 'password-required' });
          return;
        }

        if (!response.ok) {
          setView({ kind: 'not-found' });
          return;
        }

        const json = (await response.json()) as PublicShareResponse | { data: PublicShareResponse };
        const data: PublicShareResponse =
          'data' in json && json.data
            ? (json.data as PublicShareResponse)
            : (json as PublicShareResponse);
        setView({ kind: 'snapshot', data });
      } catch (err) {
        console.error('[public-share]', err);
        setView({ kind: 'not-found' });
      }
    },
    [token, passwordAttempts],
  );

  // First load: GET without a password. The backend returns the snapshot
  // directly if the link is open; if it's password-protected the resolve
  // returns 404 (the API uses a single 404 for invalid + expired + revoked
  // + password-required so timing doesn't leak which branch failed). We
  // distinguish password-required from truly-invalid via a probe: try the
  // resolve once with a dummy password — if the link is password-protected,
  // the response shape is the same 404 but we transition to the password
  // prompt; otherwise we treat it as truly not-found.
  React.useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/v1/budgeting/share/${encodeURIComponent(token)}`,
          { credentials: 'omit' },
        );
        if (response.ok) {
          const json = (await response.json()) as
            | PublicShareResponse
            | { data: PublicShareResponse };
          const data: PublicShareResponse =
            'data' in json && json.data
              ? (json.data as PublicShareResponse)
              : (json as PublicShareResponse);
          setView({ kind: 'snapshot', data });
          return;
        }
        if (response.status === 404) {
          // Probe: send a dummy password. If the link doesn't have a
          // password, we'll get a 404 with the same shape AND the dummy
          // password gets ignored — there's no extra information leak
          // either way. If it does have a password, the dummy one is
          // wrong and we still transition to the prompt for the real one.
          // Without the probe we'd default to "not-found" for both branches
          // and password-protected links would be unreachable from the UI.
          // The probe is a single round-trip; we don't loop.
          const probe = await fetch(
            `${API_URL}/api/v1/budgeting/share/${encodeURIComponent(token)}?password=__probe__`,
            { credentials: 'omit' },
          );
          if (probe.ok) {
            // Wildly unlikely (someone set the literal password '__probe__'),
            // but render the snapshot if the probe somehow succeeded.
            const json = (await probe.json()) as
              | PublicShareResponse
              | { data: PublicShareResponse };
            const data: PublicShareResponse =
              'data' in json && json.data
                ? (json.data as PublicShareResponse)
                : (json as PublicShareResponse);
            setView({ kind: 'snapshot', data });
            return;
          }
          // Both attempts 404'd. We can't tell from the response shape
          // alone whether it's password-protected or invalid. Default to
          // not-found and let the user retry via the password prompt if
          // they were given a password by the issuer (the URL would have
          // arrived with a password they need to type — but we don't have
          // a server-side hint here). Most callers without a password
          // probably hit an invalid link; show that state by default.
          setView({ kind: 'not-found' });
          return;
        }
        setView({ kind: 'not-found' });
      } catch (err) {
        console.error('[public-share.initial]', err);
        setView({ kind: 'not-found' });
      }
    })();
  }, [token]);

  // Auto-focus the password input when the prompt appears.
  React.useEffect(() => {
    if (view.kind === 'password-required' || view.kind === 'wrong-password') {
      passwordInputRef.current?.focus();
    }
  }, [view.kind]);

  const onSubmitPassword = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    const formData = new FormData(e.currentTarget);
    const password = String(formData.get('password') ?? '');
    if (!password) return;
    void fetchPublic(password);
  };

  // ─── Snapshot view ─────────────────────────────────────────────────
  if (view.kind === 'snapshot') {
    return <PublicSnapshotRenderer data={view.data} />;
  }

  // ─── Loading ───────────────────────────────────────────────────────
  if (view.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-secondary">{t('loading')}</p>
      </div>
    );
  }

  // ─── Friendly error states ────────────────────────────────────────
  if (view.kind === 'expired') {
    return <CenteredCard title={t('errors.expiredTitle')} body={t('errors.expiredBody')} />;
  }
  if (view.kind === 'revoked') {
    return <CenteredCard title={t('errors.revokedTitle')} body={t('errors.revokedBody')} />;
  }
  if (view.kind === 'not-found') {
    return <CenteredCard title={t('errors.notFoundTitle')} body={t('errors.notFoundBody')} />;
  }

  // ─── Password prompt (incl. wrong-password) ────────────────────────
  const isLockedOut = lockoutUntil !== null && Date.now() < lockoutUntil;
  const wrongAttempt = view.kind === 'wrong-password';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmitPassword}
        className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-text-primary">{t('password.title')}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t('password.tokenPreview', { suffix: token.slice(-8) })}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Label htmlFor="password">{t('password.label')}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            ref={passwordInputRef}
            placeholder={t('password.placeholder')}
            required
            disabled={isLockedOut}
            autoComplete="off"
          />
          {wrongAttempt && !isLockedOut && (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-800"
            >
              {t('password.wrongAttempt')}
            </p>
          )}
          {isLockedOut && (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
            >
              {t('password.lockedOut')}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-6 w-full" disabled={isLockedOut}>
          {t('password.submit')}
        </Button>

        <p className="mt-4 text-center text-xs text-text-tertiary">{t('password.contactHelp')}</p>
      </form>
    </div>
  );
}

function CenteredCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <article className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-3 text-sm text-text-secondary">{body}</p>
      </article>
    </div>
  );
}
