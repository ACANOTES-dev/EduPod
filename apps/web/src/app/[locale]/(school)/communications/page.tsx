'use client';

import {
  ArrowRight,
  Bell,
  Inbox as InboxIcon,
  KeyRound,
  Megaphone,
  ShieldAlert,
  Siren,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient, unwrap } from '@/lib/api-client';

/**
 * Communications hub dashboard. Entry point when the user clicks the
 * envelope icon in the morph bar. Shows live stat cards for Inbox,
 * Audiences, Announcements and Oversight, plus admin-tier setting
 * tiles for messaging policy, safeguarding keywords, and notification
 * fallback.
 *
 * Each stat fetch is independent and fails soft — a stat that can't
 * load renders an em dash, it never blocks the other cards or trips
 * the error boundary.
 */

interface InboxStateResponse {
  unread_total: number;
  latest_message_at: string | null;
}

interface AudienceListResponse {
  data: unknown[];
  meta?: { total: number };
}

interface AnnouncementSummary {
  id: string;
  title: string;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
}

interface AnnouncementsListResponse {
  data: AnnouncementSummary[];
  meta?: { total: number };
}

interface OversightFlagsResponse {
  data: unknown[];
  meta: { total: number };
}

type CardState<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

export default function CommunicationsHubPage() {
  const t = useTranslations('communications.hub');
  const locale = useLocale();

  const [inboxState, setInboxState] = React.useState<CardState<InboxStateResponse>>({
    status: 'loading',
  });
  const [audienceCount, setAudienceCount] = React.useState<CardState<number>>({
    status: 'loading',
  });
  const [latestAnnouncement, setLatestAnnouncement] = React.useState<
    CardState<AnnouncementSummary | null>
  >({ status: 'loading' });
  const [pendingFlagCount, setPendingFlagCount] = React.useState<CardState<number>>({
    status: 'loading',
  });

  React.useEffect(() => {
    let cancelled = false;

    const fetchInboxState = async () => {
      try {
        const res = await apiClient<InboxStateResponse | { data: InboxStateResponse }>(
          '/api/v1/inbox/state',
          { silent: true },
        );
        if (cancelled) return;
        setInboxState({ status: 'ready', value: unwrap<InboxStateResponse>(res) });
      } catch (err) {
        console.error('[CommunicationsHub.fetchInboxState]', err);
        if (!cancelled) setInboxState({ status: 'error' });
      }
    };

    const fetchAudienceCount = async () => {
      try {
        const res = await apiClient<AudienceListResponse | { data: AudienceListResponse }>(
          '/api/v1/inbox/audiences',
          { silent: true },
        );
        if (cancelled) return;
        const body = unwrap<AudienceListResponse>(res);
        const total = body.meta?.total ?? body.data?.length ?? 0;
        setAudienceCount({ status: 'ready', value: total });
      } catch (err) {
        console.error('[CommunicationsHub.fetchAudienceCount]', err);
        if (!cancelled) setAudienceCount({ status: 'error' });
      }
    };

    const fetchLatestAnnouncement = async () => {
      try {
        const res = await apiClient<
          AnnouncementsListResponse | { data: AnnouncementsListResponse }
        >('/api/v1/announcements?page=1&pageSize=1', { silent: true });
        if (cancelled) return;
        const body = unwrap<AnnouncementsListResponse>(res);
        const first = body.data?.[0] ?? null;
        setLatestAnnouncement({ status: 'ready', value: first });
      } catch (err) {
        console.error('[CommunicationsHub.fetchLatestAnnouncement]', err);
        if (!cancelled) setLatestAnnouncement({ status: 'error' });
      }
    };

    const fetchPendingFlags = async () => {
      try {
        const res = await apiClient<OversightFlagsResponse | { data: OversightFlagsResponse }>(
          '/api/v1/inbox/oversight/flags?page=1&pageSize=1&review_state=pending',
          { silent: true },
        );
        if (cancelled) return;
        const body = unwrap<OversightFlagsResponse>(res);
        setPendingFlagCount({ status: 'ready', value: body.meta?.total ?? 0 });
      } catch (err) {
        // Users without oversight permission get 403 here — that's expected
        // and the card just shows "—"
        console.error('[CommunicationsHub.fetchPendingFlags]', err);
        if (!cancelled) setPendingFlagCount({ status: 'error' });
      }
    };

    void fetchInboxState();
    void fetchAudienceCount();
    void fetchLatestAnnouncement();
    void fetchPendingFlags();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">{t('description')}</p>
      </header>

      {/* ─── Stat cards ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href={`/${locale}/inbox`}
          icon={InboxIcon}
          accent="primary"
          title={t('cards.inbox.title')}
          description={t('cards.inbox.description')}
          metric={
            inboxState.status === 'ready'
              ? t('cards.inbox.unreadLabel', { count: inboxState.value.unread_total })
              : inboxState.status === 'error'
                ? '—'
                : null
          }
          metricEmphasis={
            inboxState.status === 'ready' ? String(inboxState.value.unread_total) : undefined
          }
          footerNote={
            inboxState.status === 'ready' && inboxState.value.latest_message_at
              ? `${t('cards.inbox.latestPrefix')} · ${new Date(
                  inboxState.value.latest_message_at,
                ).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
              : undefined
          }
          cta={t('cards.inbox.cta')}
        />

        <StatCard
          href={`/${locale}/inbox/audiences`}
          icon={Users}
          accent="info"
          title={t('cards.audiences.title')}
          description={t('cards.audiences.description')}
          metric={
            audienceCount.status === 'ready'
              ? t('cards.audiences.countLabel', { count: audienceCount.value })
              : audienceCount.status === 'error'
                ? '—'
                : null
          }
          metricEmphasis={
            audienceCount.status === 'ready' ? String(audienceCount.value) : undefined
          }
          cta={t('cards.audiences.cta')}
        />

        <StatCard
          href={`/${locale}/communications/announcements`}
          icon={Megaphone}
          accent="success"
          title={t('cards.announcements.title')}
          description={t('cards.announcements.description')}
          metric={
            latestAnnouncement.status === 'ready'
              ? latestAnnouncement.value
                ? latestAnnouncement.value.title
                : t('cards.announcements.emptyLabel')
              : latestAnnouncement.status === 'error'
                ? '—'
                : null
          }
          metricTruncate
          footerNote={
            latestAnnouncement.status === 'ready' &&
            latestAnnouncement.value &&
            (latestAnnouncement.value.published_at ?? latestAnnouncement.value.scheduled_at)
              ? `${t('cards.announcements.latestLabel')} · ${new Date(
                  (latestAnnouncement.value.published_at ??
                    latestAnnouncement.value.scheduled_at) as string,
                ).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
              : undefined
          }
          cta={t('cards.announcements.cta')}
        />

        <StatCard
          href={`/${locale}/inbox/oversight`}
          icon={ShieldAlert}
          accent={
            pendingFlagCount.status === 'ready' && pendingFlagCount.value > 0
              ? 'warning'
              : 'neutral'
          }
          title={t('cards.oversight.title')}
          description={t('cards.oversight.description')}
          metric={
            pendingFlagCount.status === 'ready'
              ? t('cards.oversight.pendingLabel', { count: pendingFlagCount.value })
              : pendingFlagCount.status === 'error'
                ? '—'
                : null
          }
          metricEmphasis={
            pendingFlagCount.status === 'ready' ? String(pendingFlagCount.value) : undefined
          }
          cta={t('cards.oversight.cta')}
        />
      </section>

      {/* ─── Settings tiles ────────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-text-primary">{t('settings.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('settings.description')}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SettingTile
            href={`/${locale}/settings/messaging-policy`}
            icon={Bell}
            title={t('settings.messagingPolicy.title')}
            description={t('settings.messagingPolicy.description')}
          />
          <SettingTile
            href={`/${locale}/settings/communications/safeguarding`}
            icon={KeyRound}
            title={t('settings.safeguardingKeywords.title')}
            description={t('settings.safeguardingKeywords.description')}
          />
          <SettingTile
            href={`/${locale}/settings/communications/fallback`}
            icon={Siren}
            title={t('settings.fallback.title')}
            description={t('settings.fallback.description')}
          />
        </div>
      </section>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

type Accent = 'primary' | 'info' | 'success' | 'warning' | 'neutral';

const ACCENT_CLASSES: Record<Accent, { icon: string; ring: string }> = {
  primary: { icon: 'bg-primary-100 text-primary-700', ring: 'group-hover:border-primary-400' },
  info: { icon: 'bg-info-fill text-info-text', ring: 'group-hover:border-info-border' },
  success: {
    icon: 'bg-success-fill text-success-text',
    ring: 'group-hover:border-success-border',
  },
  warning: {
    icon: 'bg-warning-fill text-warning-text',
    ring: 'group-hover:border-warning-border',
  },
  neutral: {
    icon: 'bg-surface-secondary text-text-secondary',
    ring: 'group-hover:border-border-strong',
  },
};

interface StatCardProps {
  href: string;
  icon: React.ElementType;
  accent: Accent;
  title: string;
  description: string;
  metric: string | null;
  metricEmphasis?: string;
  metricTruncate?: boolean;
  footerNote?: string;
  cta: string;
}

function StatCard({
  href,
  icon: Icon,
  accent,
  title,
  description,
  metric,
  metricEmphasis,
  metricTruncate,
  footerNote,
  cta,
}: StatCardProps) {
  const classes = ACCENT_CLASSES[accent];
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-5 transition-all hover:shadow-sm ${classes.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${classes.icon}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <ArrowRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-xs text-text-secondary line-clamp-2">{description}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-1 border-t border-border pt-3">
        {metricEmphasis ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-text-primary tabular-nums">
              {metricEmphasis}
            </span>
            <span className="truncate text-xs text-text-secondary">{metric}</span>
          </div>
        ) : metric === null ? (
          <div className="h-6 w-24 animate-pulse rounded bg-surface-secondary" aria-hidden="true" />
        ) : (
          <p
            className={`text-sm font-medium text-text-primary ${metricTruncate ? 'truncate' : ''}`}
            title={metricTruncate ? metric : undefined}
          >
            {metric}
          </p>
        )}
        {footerNote && <span className="truncate text-xs text-text-tertiary">{footerNote}</span>}
      </div>

      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 group-hover:gap-1.5">
        {cta}
        <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
      </span>
    </Link>
  );
}

// ─── Setting tile ────────────────────────────────────────────────────────────

interface SettingTileProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

function SettingTile({ href, icon: Icon, title, description }: SettingTileProps) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-secondary group-hover:bg-primary-100 group-hover:text-primary-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-xs text-text-secondary line-clamp-2">{description}</p>
      </div>
      <ArrowRight
        className="mt-1 h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
