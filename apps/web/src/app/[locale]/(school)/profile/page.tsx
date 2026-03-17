'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { ShieldCheck, Monitor, Sun, Moon, RefreshCw, Trash2 } from 'lucide-react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Separator,
} from '@school/ui';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface MfaSetupData {
  secret: string;
  qr_uri: string;
  qr_data_url: string;
}

interface SessionData {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  last_active_at: string | null;
  is_current: boolean;
}

type ThemeOption = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: ThemeOption; Icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', Icon: Sun, labelKey: 'userMenu.themeLight' },
  { value: 'dark', Icon: Moon, labelKey: 'userMenu.themeDark' },
  { value: 'system', Icon: Monitor, labelKey: 'userMenu.themeSystem' },
];

/* -------------------------------------------------------------------------- */
/* Profile Page                                                                */
/* -------------------------------------------------------------------------- */

export default function ProfilePage() {
  const t = useTranslations();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();

  /* ---- Profile form state ---- */
  const [firstName, setFirstName] = React.useState(user?.first_name ?? '');
  const [lastName, setLastName] = React.useState(user?.last_name ?? '');
  const [preferredLocale, setPreferredLocale] = React.useState(
    user?.preferred_locale ?? 'en',
  );
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /* ---- Sync form when user changes ---- */
  React.useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setPreferredLocale(user.preferred_locale ?? 'en');
    }
  }, [user]);

  /* ---- MFA state ---- */
  const [mfaSetupData, setMfaSetupData] = React.useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaSetupLoading, setMfaSetupLoading] = React.useState(false);
  const [mfaVerifyLoading, setMfaVerifyLoading] = React.useState(false);
  const [mfaMessage, setMfaMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /* ---- Sessions state ---- */
  const [sessions, setSessions] = React.useState<SessionData[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /* ---- Load sessions on mount ---- */
  React.useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      try {
        const data = await apiClient<{ data: SessionData[] }>('/api/v1/auth/sessions');
        if (!cancelled) setSessions(data.data ?? []);
      } catch {
        // Silently fail — non-critical
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }
    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Handlers ---- */

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      await apiClient('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          preferred_locale: preferredLocale,
        }),
      });
      await refreshUser();
      setProfileMessage({ type: 'success', text: t('profile.saveSuccess') });
    } catch {
      setProfileMessage({ type: 'error', text: t('profile.saveError') });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleMfaSetup() {
    setMfaSetupLoading(true);
    setMfaMessage(null);
    try {
      const data = await apiClient<{ data: MfaSetupData }>('/api/v1/auth/mfa/setup', {
        method: 'POST',
      });
      setMfaSetupData(data.data);
    } catch {
      setMfaMessage({ type: 'error', text: t('profile.mfaSetupError') });
    } finally {
      setMfaSetupLoading(false);
    }
  }

  async function handleMfaVerify() {
    if (!mfaCode || mfaCode.length !== 6) return;
    setMfaVerifyLoading(true);
    setMfaMessage(null);
    try {
      await apiClient('/api/v1/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      setMfaMessage({ type: 'success', text: t('profile.mfaVerifySuccess') });
      setMfaSetupData(null);
      setMfaCode('');
      await refreshUser();
    } catch {
      setMfaMessage({ type: 'error', text: t('profile.mfaVerifyError') });
    } finally {
      setMfaVerifyLoading(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    setRevokingId(sessionId);
    setSessionMessage(null);
    try {
      await apiClient(`/api/v1/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionMessage({ type: 'success', text: t('profile.revokeSuccess') });
    } catch {
      setSessionMessage({ type: 'error', text: t('profile.revokeError') });
    } finally {
      setRevokingId(null);
    }
  }

  function formatLastActive(iso: string | null): string {
    if (!iso) return '—';
    return formatDateTime(iso) || iso;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      {/* Page title */}
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        {t('profile.title')}
      </h1>

      {/* ------------------------------------------------------------------ */}
      {/* Personal Information                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        <h2 className="text-base font-semibold text-text-primary">{t('profile.personalInfo')}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">{t('profile.firstName')}</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">{t('profile.lastName')}</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">{t('profile.email')}</Label>
          <Input
            id="email"
            value={user?.email ?? ''}
            disabled
            className="opacity-60 cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preferred-locale">{t('profile.preferredLocale')}</Label>
          <Select value={preferredLocale} onValueChange={setPreferredLocale}>
            <SelectTrigger id="preferred-locale" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('profile.localeEn')}</SelectItem>
              <SelectItem value="ar">{t('profile.localeAr')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t('profile.theme')}</Label>
          <div className="flex gap-2 flex-wrap">
            {THEME_OPTIONS.map(({ value, Icon, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                  theme === value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-border text-text-secondary hover:bg-surface-secondary',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {profileMessage && (
          <p
            className={
              profileMessage.type === 'success'
                ? 'text-sm text-success-text'
                : 'text-sm text-danger-text'
            }
          >
            {profileMessage.text}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? t('profile.saving') : t('profile.saveProfile')}
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* MFA Section                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text-primary">{t('profile.mfaSection')}</h2>
          </div>
          {user?.mfa_enabled ? (
            <Badge variant="success">{t('profile.mfaEnabled')}</Badge>
          ) : (
            <span className="text-sm text-text-tertiary">{t('profile.mfaNotEnabled')}</span>
          )}
        </div>

        {!user?.mfa_enabled && !mfaSetupData && (
          <Button variant="outline" onClick={handleMfaSetup} disabled={mfaSetupLoading}>
            {mfaSetupLoading && <RefreshCw className="me-2 h-4 w-4 animate-spin" />}
            {t('profile.enableMfa')}
          </Button>
        )}

        {mfaSetupData && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('profile.mfaSetupInstructions')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mfaSetupData.qr_data_url}
              alt="MFA QR code"
              className="h-48 w-48 rounded-xl border border-border"
            />
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="mfa-code">{t('profile.mfaVerifyCode')}</Label>
              <Input
                id="mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('profile.mfaVerifyCodePlaceholder')}
                maxLength={6}
                inputMode="numeric"
                dir="ltr"
                className="font-mono tracking-widest"
              />
            </div>
            <Button
              onClick={handleMfaVerify}
              disabled={mfaVerifyLoading || mfaCode.length !== 6}
            >
              {mfaVerifyLoading ? t('profile.verifying') : t('profile.verifyAndEnable')}
            </Button>
          </div>
        )}

        {mfaMessage && (
          <p
            className={
              mfaMessage.type === 'success'
                ? 'text-sm text-success-text'
                : 'text-sm text-danger-text'
            }
          >
            {mfaMessage.text}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Active Sessions                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">{t('profile.sessionsSection')}</h2>
        <p className="text-sm text-text-secondary">{t('profile.sessionsDescription')}</p>

        {sessionsLoading ? (
          <p className="text-sm text-text-tertiary">{t('profile.loadingSession')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('profile.noSessions')}</p>
        ) : (
          <ul className="space-y-0">
            {sessions.map((session, idx) => (
              <React.Fragment key={session.id}>
                {idx > 0 && <Separator />}
                <li className="flex items-start justify-between gap-4 py-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {session.user_agent ?? t('profile.device')}
                      </span>
                      {session.is_current && (
                        <Badge variant="secondary" className="text-xs">
                          {t('profile.sessionCurrent')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-tertiary flex-wrap">
                      {session.ip_address && (
                        <span dir="ltr">{session.ip_address}</span>
                      )}
                      <span>
                        {t('profile.lastActive')}: {formatLastActive(session.last_active_at)}
                      </span>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeSession(session.id)}
                      disabled={revokingId === session.id}
                      className="shrink-0 text-danger-text hover:text-danger-text hover:bg-danger-fill"
                    >
                      <Trash2 className="me-1 h-3.5 w-3.5" />
                      {t('profile.revokeSession')}
                    </Button>
                  )}
                </li>
              </React.Fragment>
            ))}
          </ul>
        )}

        {sessionMessage && (
          <p
            className={
              sessionMessage.type === 'success'
                ? 'text-sm text-success-text'
                : 'text-sm text-danger-text'
            }
          >
            {sessionMessage.text}
          </p>
        )}
      </section>
    </div>
  );
}
