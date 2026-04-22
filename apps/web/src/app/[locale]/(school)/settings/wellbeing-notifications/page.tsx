'use client';

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  type WellbeingChannelPreferences,
  type WellbeingNotificationEventKey,
} from '@school/shared/wellbeing';
import { Button, Switch, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'whatsapp';
type CellState = 'default' | 'on' | 'off';

interface EventGroup {
  key: string;
  events: WellbeingNotificationEventKey[];
}

// ─── Event grouping (matches backend catalogue comments) ─────────────────────

const EVENT_GROUPS: EventGroup[] = [
  {
    key: 'behaviour',
    events: [
      'incident.logged',
      'incident.escalated',
      'incident.parent_meeting_scheduled',
      'sanction.scheduled',
      'sanction.served',
      'sanction.no_show',
      'recognition.awarded',
      'amendment.sent',
      'document.sent_to_parent',
    ],
  },
  {
    key: 'pastoral',
    events: ['concern.raised', 'concern.acknowledged'],
  },
  {
    key: 'safeguarding',
    events: [
      'sla.breach',
      'critical.declared',
      'critical.acknowledged',
      'break_glass.granted',
      'break_glass.expired',
    ],
  },
  {
    key: 'appeals',
    events: ['appeal.submitted', 'appeal.decided'],
  },
  {
    key: 'reminders',
    events: ['reminder.acknowledgement'],
  },
];

const CHANNELS: { key: Channel; icon: typeof Mail }[] = [
  { key: 'email', icon: Mail },
  { key: 'sms', icon: MessageSquare },
  { key: 'whatsapp', icon: MessageCircle },
];

const EMPTY_PREFS: WellbeingChannelPreferences = {
  defaults: { email: false, sms: false, whatsapp: false },
  overrides: {},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellState(prefs: WellbeingChannelPreferences, event: string, channel: Channel): CellState {
  const override = prefs.overrides[event]?.[channel];
  if (override === undefined) return 'default';
  return override ? 'on' : 'off';
}

function resolvedValue(
  prefs: WellbeingChannelPreferences,
  event: string,
  channel: Channel,
): boolean {
  const override = prefs.overrides[event]?.[channel];
  return override ?? prefs.defaults[channel];
}

function cyclePrefs(
  prefs: WellbeingChannelPreferences,
  event: string,
  channel: Channel,
): WellbeingChannelPreferences {
  // Cycle: default → on → off → default
  const current = cellState(prefs, event, channel);
  const nextOverride: boolean | undefined =
    current === 'default' ? true : current === 'on' ? false : undefined;

  const existingOverride = prefs.overrides[event] ?? {};
  const nextOverrideRow = { ...existingOverride };
  if (nextOverride === undefined) {
    delete nextOverrideRow[channel];
  } else {
    nextOverrideRow[channel] = nextOverride;
  }

  const nextOverrides = { ...prefs.overrides };
  if (Object.keys(nextOverrideRow).length === 0) {
    delete nextOverrides[event];
  } else {
    nextOverrides[event] = nextOverrideRow;
  }

  return { defaults: prefs.defaults, overrides: nextOverrides };
}

function removeEventOverrides(
  prefs: WellbeingChannelPreferences,
  event: string,
): WellbeingChannelPreferences {
  if (!prefs.overrides[event]) return prefs;
  const next = { ...prefs.overrides };
  delete next[event];
  return { defaults: prefs.defaults, overrides: next };
}

function equalPrefs(a: WellbeingChannelPreferences, b: WellbeingChannelPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WellbeingNotificationsSettingsPage() {
  const t = useTranslations('wellbeingNotificationsSettings');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole(...ADMIN_ROLES);

  const [persisted, setPersisted] = React.useState<WellbeingChannelPreferences>(EMPTY_PREFS);
  const [draft, setDraft] = React.useState<WellbeingChannelPreferences>(EMPTY_PREFS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const isDirty = !equalPrefs(persisted, draft);

  React.useEffect(() => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: WellbeingChannelPreferences }>('/api/v1/wellbeing-notifications/channels')
      .then((res) => {
        if (cancelled) return;
        setPersisted(res.data);
        setDraft(res.data);
      })
      .catch((err) => {
        console.error('[WellbeingNotificationsSettings] load failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, reloadKey, t]);

  const handleSave = React.useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await apiClient<{ data: WellbeingChannelPreferences }>(
        '/api/v1/wellbeing-notifications/channels',
        {
          method: 'PUT',
          body: JSON.stringify(draft),
        },
      );
      setPersisted(res.data);
      setDraft(res.data);
      toast.success(t('saveSuccess'));
    } catch (err) {
      console.error('[WellbeingNotificationsSettings] save failed', err);
      const e = err as { error?: { message?: string } };
      toast.error(e?.error?.message ?? t('saveError'));
    } finally {
      setIsSaving(false);
    }
  }, [draft, t]);

  const handleReset = React.useCallback(() => {
    setDraft(persisted);
  }, [persisted]);

  // ── Permission denied ───────────────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/settings`, label: t('back') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Settings2 className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{t('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{t('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-24">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/settings`, label: t('back') }}
      />

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {/* ── In-app reminder banner ──────────────────────────────────────── */}
      <section className="flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-sky-200/80 text-sky-700">
            <Bell className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-sky-900">{t('inAppBanner.title')}</p>
            <p className="text-xs text-sky-700">{t('inAppBanner.body')}</p>
          </div>
        </div>
      </section>

      {/* ── Defaults section ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600" />
        <div className="flex items-start gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 shadow-sm ring-1 ring-inset ring-black/5">
            <Settings2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">{t('defaults.title')}</h2>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('defaults.description')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
          {CHANNELS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary/40 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-text-secondary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {t(`channel.${key}.label`)}
                  </p>
                  <p className="text-xs text-text-tertiary">{t(`channel.${key}.description`)}</p>
                </div>
              </div>
              <Switch
                checked={draft.defaults[key]}
                onCheckedChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    defaults: { ...prev.defaults, [key]: next },
                  }))
                }
                disabled={isLoading || isSaving}
                aria-label={t(`channel.${key}.label`)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Per-event overrides ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-start gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-sm ring-1 ring-inset ring-black/5">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">{t('overrides.title')}</h2>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('overrides.description')}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {EVENT_GROUPS.map((group) => (
              <div key={group.key} className="px-5 py-5 sm:px-6">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t(`group.${group.key}`)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.events.map((event) => {
                    const hasOverride = Boolean(draft.overrides[event]);
                    return (
                      <li
                        key={event}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {t(`event.${event}.label`)}
                          </p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            {t(`event.${event}.description`)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          {CHANNELS.map(({ key: channel, icon: Icon }) => (
                            <ChannelCell
                              key={channel}
                              channel={channel}
                              icon={Icon}
                              state={cellState(draft, event, channel)}
                              resolved={resolvedValue(draft, event, channel)}
                              labelOn={t('cell.on')}
                              labelOff={t('cell.off')}
                              labelDefault={t('cell.default', {
                                state: draft.defaults[channel] ? t('cell.on') : t('cell.off'),
                              })}
                              ariaLabel={t('cell.ariaLabel', {
                                channel: t(`channel.${channel}.label`),
                                event: t(`event.${event}.label`),
                              })}
                              disabled={isSaving}
                              onClick={() => setDraft((prev) => cyclePrefs(prev, event, channel))}
                            />
                          ))}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            disabled={!hasOverride || isSaving}
                            onClick={() => setDraft((prev) => removeEventOverrides(prev, event))}
                          >
                            <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                            {t('resetRow')}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sticky save bar ─────────────────────────────────────────────── */}
      <div
        className={`sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-lg transition-all sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
          isDirty
            ? 'border-primary-300 bg-primary-50/90 backdrop-blur'
            : 'border-border bg-surface/90 backdrop-blur'
        }`}
      >
        <div className="flex items-center gap-2 text-sm">
          {isDirty ? (
            <>
              <AlertTriangle className="h-4 w-4 text-primary-700" />
              <span className="font-medium text-primary-900">{t('unsavedChanges')}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-success-600" />
              <span className="text-text-secondary">{t('allSaved')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || isSaving}
          >
            {t('discard')}
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            <Save className="me-1.5 h-3.5 w-3.5" />
            {isSaving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel cell ────────────────────────────────────────────────────────────

interface ChannelCellProps {
  channel: Channel;
  icon: typeof Mail;
  state: CellState;
  resolved: boolean;
  labelOn: string;
  labelOff: string;
  labelDefault: string;
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
}

function ChannelCell({
  channel: _channel,
  icon: Icon,
  state,
  resolved,
  labelOn,
  labelOff,
  labelDefault,
  ariaLabel,
  disabled,
  onClick,
}: ChannelCellProps) {
  const stateStyles: Record<CellState, string> = {
    on: 'border-success-300 bg-success-50 text-success-700',
    off: 'border-danger-200 bg-danger-50 text-danger-700',
    default: resolved
      ? 'border-border bg-surface-secondary text-text-secondary'
      : 'border-dashed border-border bg-surface text-text-tertiary',
  };

  const label = state === 'on' ? labelOn : state === 'off' ? labelOff : labelDefault;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all hover:shadow-sm disabled:opacity-60 ${stateStyles[state]}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
