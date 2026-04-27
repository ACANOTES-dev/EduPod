'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Mail,
  MessageCircle,
  MinusCircle,
  Phone,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { MaskedEmailConfig, MaskedSmsConfig, MaskedWhatsAppConfig } from '@school/shared';
import { toast } from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';

import { NoPermissionState } from './_components/no-permission-state';

type ChannelKind = 'email' | 'sms' | 'whatsapp';

type ChannelStatus =
  | { kind: 'configured'; lastVerifiedAt: Date | null; isEnabled: boolean }
  | { kind: 'verification_failed'; lastVerifiedAt: Date | null }
  | { kind: 'disabled'; lastVerifiedAt: Date | null }
  | { kind: 'not_configured' };

type AnyMasked = MaskedEmailConfig | MaskedSmsConfig | MaskedWhatsAppConfig;

function toStatus(result: PromiseSettledResult<AnyMasked | { data: AnyMasked }>): ChannelStatus {
  if (result.status === 'rejected') {
    const err = result.reason as { error?: { code?: string }; status?: number };
    if (err?.error?.code === 'EMAIL_CONFIG_NOT_FOUND' || err?.status === 404) {
      return { kind: 'not_configured' };
    }
    return { kind: 'not_configured' };
  }
  const config = unwrap(result.value) as AnyMasked;
  if (!config.is_enabled) {
    return { kind: 'disabled', lastVerifiedAt: config.last_verified_at };
  }
  if (config.last_verified_at) {
    return { kind: 'configured', lastVerifiedAt: config.last_verified_at, isEnabled: true };
  }
  return { kind: 'verification_failed', lastVerifiedAt: null };
}

export default function CommunicationsIndexPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'en';
  const t = useTranslations('settings.communications');
  const { hasAnyRole } = useRoleCheck();

  const canManage = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');

  const [emailStatus, setEmailStatus] = React.useState<ChannelStatus>({ kind: 'not_configured' });
  const [smsStatus, setSmsStatus] = React.useState<ChannelStatus>({ kind: 'not_configured' });
  const [whatsappStatus, setWhatsappStatus] = React.useState<ChannelStatus>({
    kind: 'not_configured',
  });
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void (async () => {
      const [email, sms, whatsapp] = await Promise.allSettled([
        apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>('/api/v1/email-config'),
        apiClient<MaskedSmsConfig | { data: MaskedSmsConfig }>('/api/v1/sms-config'),
        apiClient<MaskedWhatsAppConfig | { data: MaskedWhatsAppConfig }>('/api/v1/whatsapp-config'),
      ]);
      if (cancelled) return;
      setEmailStatus(toStatus(email));
      setSmsStatus(toStatus(sms));
      setWhatsappStatus(toStatus(whatsapp));
      setIsLoading(false);
      // Surface non-404 errors as a toast (one only — per channel quietly degrades)
      const failures = [email, sms, whatsapp].filter(
        (r): r is PromiseRejectedResult =>
          r.status === 'rejected' &&
          (r.reason as { status?: number; error?: { code?: string } })?.status !== 404 &&
          (r.reason as { error?: { code?: string } })?.error?.code !== 'EMAIL_CONFIG_NOT_FOUND',
      );
      if (failures.length > 0) {
        toast.error(t('errors.loadFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, t]);

  if (!canManage) return <NoPermissionState locale={locale} />;

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <ChannelCard channel="email" status={emailStatus} locale={locale} />
            <ChannelCard channel="sms" status={smsStatus} locale={locale} />
            <ChannelCard channel="whatsapp" status={whatsappStatus} locale={locale} />
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-secondary" />
  );
}

const CHANNEL_ICONS: Record<ChannelKind, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageCircle,
};

function ChannelCard({
  channel,
  status,
  locale,
}: {
  channel: ChannelKind;
  status: ChannelStatus;
  locale: string;
}) {
  const t = useTranslations('settings.communications');
  const Icon = CHANNEL_ICONS[channel];
  const StatusIcon = STATUS_ICONS[status.kind];
  const statusToken = STATUS_TOKENS[status.kind];

  return (
    <Link
      href={`/${locale}/settings/communications/${channel}`}
      className="group block rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-surface-secondary p-2 text-text-secondary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-text-primary">{t(`channels.${channel}`)}</p>
            <p className="text-xs text-text-tertiary">{t(`providers.${channel}`)}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusToken}`}>
          {t(`status.${statusKindToTKey(status.kind)}`)}
        </span>
      </div>

      <div className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
        <StatusIcon className="h-4 w-4" />
        <span>
          {status.kind === 'not_configured'
            ? t('status.notConfigured')
            : formatLastVerified(
                status.kind === 'verification_failed' ? null : status.lastVerifiedAt,
                t,
              )}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-end text-sm font-medium text-primary group-hover:underline">
        {status.kind === 'not_configured' ? t('actions.configure') : t('actions.update')}
        <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" />
      </div>
    </Link>
  );
}

const STATUS_ICONS: Record<ChannelStatus['kind'], React.ComponentType<{ className?: string }>> = {
  configured: CheckCircle2,
  not_configured: Circle,
  verification_failed: AlertTriangle,
  disabled: MinusCircle,
};

const STATUS_TOKENS: Record<ChannelStatus['kind'], string> = {
  configured: 'bg-success-100 text-success-700',
  not_configured: 'bg-surface-secondary text-text-tertiary',
  verification_failed: 'bg-warning-100 text-warning-700',
  disabled: 'bg-surface-secondary text-text-tertiary',
};

function statusKindToTKey(kind: ChannelStatus['kind']): string {
  switch (kind) {
    case 'configured':
      return 'configured';
    case 'not_configured':
      return 'notConfigured';
    case 'verification_failed':
      return 'verificationFailed';
    case 'disabled':
      return 'disabled';
  }
}

function formatLastVerified(
  lastVerifiedAt: Date | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!lastVerifiedAt) return t('lastVerified.never');
  const diffMs = Date.now() - new Date(lastVerifiedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('lastVerified.justNow');
  if (diffMin < 60) return t('lastVerified.minutesAgo', { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('lastVerified.hoursAgo', { n: diffHr });
  const diffDays = Math.floor(diffHr / 24);
  return t('lastVerified.daysAgo', { n: diffDays });
}
