'use client';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  Ban,
  Bell,
  BookmarkCheck,
  Brain,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileEdit,
  FilePlus2,
  FileText,
  Flag,
  Gavel,
  HeartPulse,
  Home,
  ListChecks,
  MessageSquareQuote,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserRoundCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { CardSkeleton, KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { QuickAction } from '@/components/quick-action';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type AiFlagState = 'unknown' | 'enabled' | 'disabled';

interface AiFlagRow {
  module_key: string;
  enabled: boolean;
}

interface PulseStats {
  total_incidents: number;
  positive_count: number;
  negative_count: number;
  open_tasks: number;
  overdue_tasks: number;
  // Week delta is optional — not every tenant fills it today.
  incidents_this_week?: number;
  incidents_last_week?: number;
}

interface TaskStats {
  pending: number;
  overdue: number;
  completed_today: number;
}

type ActivityKind = 'incident' | 'sanction_served' | 'recognition';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  actor_name: string | null;
  occurred_at: string;
  href: string;
}

interface IncidentRow {
  id: string;
  occurred_at: string;
  polarity: 'positive' | 'negative';
  description?: string | null;
  category?: { name?: string | null } | null;
  reported_by?: { first_name?: string | null; last_name?: string | null } | null;
  participants?: Array<{
    student?: { first_name?: string | null; last_name?: string | null } | null;
  }>;
}

interface RecognitionRow {
  id: string;
  student: { first_name: string; last_name: string } | null;
  category: { name: string; color?: string | null } | null;
  points: number;
  message?: string | null;
  published_at: string;
  awarded_by_user: { first_name: string; last_name: string } | null;
}

// ─── Hub card catalogue ───────────────────────────────────────────────────────

type HubCardKey =
  | 'incidents'
  | 'sanctions'
  | 'exclusions'
  | 'appeals'
  | 'recognition'
  | 'houses'
  | 'documents'
  | 'tasks'
  | 'alerts'
  | 'amendments'
  | 'guardianRestrictions'
  | 'analytics'
  | 'aiAnalytics';

interface HubCardConfig {
  key: HubCardKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  aiGated?: boolean;
  countFromStats?: (stats: PulseStats | null, tasks: TaskStats | null) => number | undefined;
}

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'incidents',
    href: '/behaviour/incidents',
    icon: Flag,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
    countFromStats: (stats) => stats?.total_incidents,
  },
  {
    key: 'sanctions',
    href: '/behaviour/sanctions',
    icon: Gavel,
    accent: 'from-orange-400 via-orange-500 to-orange-600',
    iconBg: 'bg-orange-100 text-orange-700',
    glow: 'from-orange-50/80',
  },
  {
    key: 'exclusions',
    href: '/behaviour/exclusions',
    icon: Ban,
    accent: 'from-red-500 via-red-600 to-red-700',
    iconBg: 'bg-red-100 text-red-700',
    glow: 'from-red-50/80',
  },
  {
    key: 'appeals',
    href: '/behaviour/appeals',
    icon: ShieldCheck,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
  },
  {
    key: 'recognition',
    href: '/behaviour/recognition',
    icon: Trophy,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
    countFromStats: (stats) => stats?.positive_count,
  },
  {
    key: 'houses',
    href: '/behaviour/recognition?tab=houses',
    icon: Home,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
  },
  {
    key: 'documents',
    href: '/behaviour/documents',
    icon: FileText,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    glow: 'from-indigo-50/80',
  },
  {
    key: 'tasks',
    href: '/behaviour/tasks',
    icon: ClipboardList,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    countFromStats: (_stats, tasks) => tasks?.overdue,
  },
  {
    key: 'alerts',
    href: '/behaviour/alerts',
    icon: Bell,
    accent: 'from-yellow-400 via-yellow-500 to-yellow-600',
    iconBg: 'bg-yellow-100 text-yellow-700',
    glow: 'from-yellow-50/80',
  },
  {
    key: 'amendments',
    href: '/behaviour/amendments',
    icon: FileEdit,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
  },
  {
    key: 'guardianRestrictions',
    href: '/behaviour/guardian-restrictions',
    icon: UserRoundCog,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    glow: 'from-slate-50/80',
  },
  {
    key: 'analytics',
    href: '/behaviour/analytics',
    icon: Activity,
    accent: 'from-pink-400 via-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-700',
    glow: 'from-pink-50/80',
  },
  {
    key: 'aiAnalytics',
    href: '/behaviour/analytics/ai',
    icon: Brain,
    accent: 'from-fuchsia-400 via-purple-500 to-indigo-500',
    iconBg: 'bg-fuchsia-100 text-fuchsia-700',
    glow: 'from-fuchsia-50/80',
    aiGated: true,
  },
];

// ─── Quick actions ────────────────────────────────────────────────────────────

type QuickActionKey = 'allIncidents' | 'byStudent' | 'aiQuery' | 'generateDocument';

interface QuickActionConfig {
  key: QuickActionKey;
  href: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  aiGated?: boolean;
}

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    key: 'allIncidents',
    href: '/behaviour/incidents',
    icon: Flag,
    accent: 'bg-rose-100 text-rose-700',
    gradient: 'from-rose-400 to-rose-600',
  },
  {
    key: 'byStudent',
    href: '/behaviour/students',
    icon: Users,
    accent: 'bg-sky-100 text-sky-700',
    gradient: 'from-sky-400 to-sky-600',
  },
  {
    key: 'aiQuery',
    href: '/behaviour/analytics/ai',
    icon: Sparkles,
    accent: 'bg-fuchsia-100 text-fuchsia-700',
    gradient: 'from-fuchsia-400 to-purple-500',
    aiGated: true,
  },
  {
    key: 'generateDocument',
    href: '/behaviour/documents',
    icon: FilePlus2,
    accent: 'bg-indigo-100 text-indigo-700',
    gradient: 'from-indigo-400 to-indigo-600',
  },
];

// ─── Activity kind → icon ─────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<ActivityKind, { icon: LucideIcon; bg: string; fg: string }> = {
  incident: { icon: AlertTriangle, bg: 'bg-rose-100', fg: 'text-rose-700' },
  sanction_served: { icon: ListChecks, bg: 'bg-slate-100', fg: 'text-slate-700' },
  recognition: { icon: Award, bg: 'bg-violet-100', fg: 'text-violet-700' },
};

// ─── Relative time helper (no new deps) ───────────────────────────────────────

function relativeFromNow(iso: string, t: (key: string, values?: Record<string, number>) => string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return t('recentActivity.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('recentActivity.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('recentActivity.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('recentActivity.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString();
}

// ─── AI flag resolver (returns 'unknown' on 403 — backend decorators still gate) ──

async function resolveAiFlag(moduleKey: string): Promise<AiFlagState> {
  try {
    const res = await apiClient<{ data: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', {
      silent: true,
    });
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    const row = rows.find((r) => r.module_key === moduleKey);
    if (!row) return 'unknown';
    return row.enabled ? 'enabled' : 'disabled';
  } catch {
    // Teachers (no ai_flag.manage) get 403 — fall through to optimistic show.
    // The per-endpoint @RequiresAiFlag decorator is the authoritative gate.
    return 'unknown';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourSubHubPage() {
  const t = useTranslations('behaviourHub');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [pulse, setPulse] = React.useState<PulseStats | null>(null);
  const [tasks, setTasks] = React.useState<TaskStats | null>(null);
  const [recentActivity, setRecentActivity] = React.useState<ActivityItem[]>([]);
  const [recognitionPreview, setRecognitionPreview] = React.useState<RecognitionRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [aiFlag, setAiFlag] = React.useState<AiFlagState>('unknown');
  const [aiParseOpen, setAiParseOpen] = React.useState(false);
  const [aiParseText, setAiParseText] = React.useState('');
  const [aiParseLoading, setAiParseLoading] = React.useState(false);

  // ── Fetch data ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const pulsePromise = apiClient<{ data: PulseStats } | PulseStats>(
      '/api/v1/behaviour/incidents/stats',
    )
      .then((res) =>
        res && 'data' in (res as object) ? (res as { data: PulseStats }).data : (res as PulseStats),
      )
      .catch((err) => {
        console.error('[BehaviourSubHub] incidents/stats failed', err);
        return null;
      });

    const tasksPromise = apiClient<{ data: TaskStats } | TaskStats>('/api/v1/behaviour/tasks/stats')
      .then((res) =>
        res && 'data' in (res as object) ? (res as { data: TaskStats }).data : (res as TaskStats),
      )
      .catch((err) => {
        console.error('[BehaviourSubHub] tasks/stats failed', err);
        return null;
      });

    const feedPromise = apiClient<{ data: IncidentRow[] }>(
      '/api/v1/behaviour/incidents?pageSize=8&sort=occurred_at&order=desc',
    )
      .then((res) => res.data ?? [])
      .catch((err) => {
        console.error('[BehaviourSubHub] incidents feed failed', err);
        return [] as IncidentRow[];
      });

    const recognitionPromise = apiClient<{ data: RecognitionRow[] }>(
      '/api/v1/behaviour/recognition?status=published&pageSize=4',
    )
      .then((res) => res.data ?? [])
      .catch((err) => {
        console.error('[BehaviourSubHub] recognition failed', err);
        return [] as RecognitionRow[];
      });

    void Promise.all([pulsePromise, tasksPromise, feedPromise, recognitionPromise])
      .then(([pulseRes, tasksRes, feed, recog]) => {
        if (cancelled) return;
        setPulse(pulseRes);
        setTasks(tasksRes);
        setRecentActivity(feedIncidentsToActivity(feed, locale));
        setRecognitionPreview(recog);
        // Only surface error when ALL primary sources failed.
        if (!pulseRes && !tasksRes && feed.length === 0 && recog.length === 0) {
          setError(t('loadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    void resolveAiFlag('behaviour').then((state) => {
      if (!cancelled) setAiFlag(state);
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, locale, t]);

  // ── AI gating ───────────────────────────────────────────────────────────
  // Show AI surfaces when flag is 'enabled' OR 'unknown' (teachers can't read
  // the flag — let the backend decorator gate actual invocations). Hide only
  // when we affirmatively know the tenant has the flag off.
  const aiVisible = aiFlag !== 'disabled';

  const visibleCards = React.useMemo(
    () => HUB_CARDS.filter((c) => !c.aiGated || aiVisible),
    [aiVisible],
  );
  const visibleActions = React.useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.aiGated || aiVisible),
    [aiVisible],
  );

  const ratioText = React.useMemo(() => {
    if (!pulse) return undefined;
    if (pulse.negative_count > 0) {
      const ratio = pulse.positive_count / pulse.negative_count;
      return `${ratio.toFixed(1)}:1`;
    }
    return pulse.positive_count > 0 ? t('kpis.allPositive') : '—';
  }, [pulse, t]);

  const weeklyDelta = React.useMemo(() => {
    if (!pulse?.incidents_this_week || pulse.incidents_last_week === undefined) return undefined;
    const diff = pulse.incidents_this_week - pulse.incidents_last_week;
    if (diff === 0) return t('kpis.weeklyFlat');
    return diff > 0
      ? t('kpis.weeklyUp', { count: diff })
      : t('kpis.weeklyDown', { count: Math.abs(diff) });
  }, [pulse, t]);

  const overdueTotal = tasks?.overdue ?? pulse?.overdue_tasks ?? 0;

  // ── AI quick parse handler ──────────────────────────────────────────────
  async function handleAiParse(event: React.FormEvent) {
    event.preventDefault();
    const text = aiParseText.trim();
    if (!text || aiParseLoading) return;
    setAiParseLoading(true);
    try {
      await apiClient<{ data: unknown }>('/api/v1/behaviour/incidents/ai-parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
        silent: true,
      });
      // Stash the prefill text so the new-incident form can pick it up.
      try {
        sessionStorage.setItem('behaviourAiParsePrefill', text);
      } catch (storageErr) {
        console.warn('[BehaviourSubHub] sessionStorage unavailable', storageErr);
      }
      router.push(`/${locale}/behaviour/incidents/new?from=ai-parse`);
    } catch (err) {
      console.error('[BehaviourSubHub] ai-parse failed', err);
    } finally {
      setAiParseLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${locale}/behaviour/incidents/new`}>
              <Button>
                <FilePlus2 className="me-1.5 h-4 w-4" />
                {t('header.logIncident')}
              </Button>
            </Link>
            {aiVisible && (
              <Button
                variant="outline"
                onClick={() => setAiParseOpen((open) => !open)}
                aria-expanded={aiParseOpen}
                aria-controls="ai-quick-parse"
              >
                <Sparkles className="me-1.5 h-4 w-4 text-fuchsia-600" />
                {t('header.parseWithAi')}
                <ChevronDown
                  className={`ms-1.5 h-4 w-4 transition-transform ${aiParseOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            )}
          </div>
        }
      />

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
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

      {/* ── Inline AI quick parse ─────────────────────────────────────── */}
      {aiVisible && aiParseOpen && (
        <section
          id="ai-quick-parse"
          className="relative overflow-hidden rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-surface to-indigo-50/40 p-5 shadow-sm"
        >
          <div className="pointer-events-none absolute -top-16 end-[-4rem] h-40 w-40 rounded-full bg-fuchsia-200/40 blur-3xl" />
          <form onSubmit={handleAiParse} className="relative flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{t('aiParse.title')}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">{t('aiParse.hint')}</p>
              </div>
            </div>
            <textarea
              value={aiParseText}
              onChange={(e) => setAiParseText(e.target.value)}
              rows={3}
              placeholder={t('aiParse.placeholder')}
              className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAiParseOpen(false);
                  setAiParseText('');
                }}
              >
                {t('aiParse.cancel')}
              </Button>
              <Button type="submit" disabled={!aiParseText.trim() || aiParseLoading}>
                {aiParseLoading ? (
                  <>
                    <RefreshCw className="me-1.5 h-4 w-4 animate-spin" />
                    {t('aiParse.parsing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="me-1.5 h-4 w-4" />
                    {t('aiParse.submit')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpis.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={Flag}
          label={t('kpis.incidentsThisWeek')}
          value={pulse ? (pulse.incidents_this_week ?? pulse.total_incidents) : undefined}
          subtitle={weeklyDelta}
          isLoading={isLoading}
          accent="text-rose-700"
          href={`/${locale}/behaviour/incidents`}
          tooltip={t('kpis.tooltips.incidentsThisWeek')}
        />
        <KpiTile
          icon={HeartPulse}
          label={t('kpis.ratio')}
          value={ratioText}
          isLoading={isLoading}
          accent="text-emerald-700"
          tooltip={t('kpis.tooltips.ratio')}
        />
        <KpiTile
          icon={ClipboardList}
          label={t('kpis.openTasks')}
          value={tasks?.pending ?? pulse?.open_tasks}
          isLoading={isLoading}
          accent="text-violet-700"
          href={`/${locale}/behaviour/tasks`}
          tooltip={t('kpis.tooltips.openTasks')}
        />
        <KpiTile
          icon={AlertTriangle}
          label={t('kpis.overdueActions')}
          value={overdueTotal}
          isLoading={isLoading}
          accent="text-amber-700"
          href={`/${locale}/behaviour/tasks?tab=overdue`}
          tooltip={t('kpis.tooltips.overdueActions')}
        />
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <section
        aria-label={t('quickActions.ariaLabel')}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {visibleActions.map((action) => (
          <QuickAction
            key={action.key}
            icon={action.icon}
            label={t(`quickActions.${action.key}`)}
            href={action.href}
            accent={action.accent}
            gradient={action.gradient}
            tooltip={t(`quickActions.tooltips.${action.key}`)}
          />
        ))}
      </section>

      {/* ── Hub cards ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('cards.ariaLabel')}
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {isLoading && !pulse ? (
          <>
            {visibleCards.map((card) => (
              <CardSkeleton key={`skeleton-${card.key}`} />
            ))}
          </>
        ) : (
          visibleCards.map((card, idx) => {
            const count = card.countFromStats ? card.countFromStats(pulse, tasks) : undefined;
            return (
              <HubTile
                key={card.key}
                icon={card.icon}
                title={t(`cards.${card.key}.title`)}
                description={t(`cards.${card.key}.description`)}
                tooltip={t(`cards.${card.key}.tooltip`)}
                href={card.href}
                accent={card.accent}
                iconBg={card.iconBg}
                glow={card.glow}
                count={count}
                animationIndex={idx}
              />
            );
          })
        )}
      </section>

      {/* ── Recognition Wall preview ──────────────────────────────────── */}
      {recognitionPreview.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-surface to-orange-50/40 shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500" />
          <div className="pointer-events-none absolute -top-8 end-[-4rem] opacity-40">
            <Sparkles className="h-24 w-24 text-amber-300" />
          </div>
          <div className="relative flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold tracking-tight text-text-primary">
                {t('recognitionPreview.title')}
              </h3>
            </div>
            <Link
              href={`/${locale}/behaviour/recognition`}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
            >
              {t('recognitionPreview.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            {recognitionPreview.map((item) => (
              <Link
                key={item.id}
                href={`/${locale}/behaviour/recognition`}
                className="group flex flex-col gap-2 rounded-xl border border-amber-100 bg-surface/80 p-3 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
              >
                <div className="flex items-start gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-sm">
                    <Star className="h-4 w-4" fill="currentColor" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {item.student
                        ? `${item.student.first_name} ${item.student.last_name}`
                        : t('recognitionPreview.unnamedStudent')}
                    </p>
                    <p className="truncate text-xs text-text-tertiary">
                      {item.category?.name ?? t('recognitionPreview.positiveNote')}
                    </p>
                  </div>
                </div>
                {item.awarded_by_user && (
                  <p className="truncate text-[11px] text-text-tertiary">
                    {t('recognitionPreview.awardedBy', {
                      name: `${item.awarded_by_user.first_name} ${item.awarded_by_user.last_name}`,
                    })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent activity ──────────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-400 via-pink-400 to-indigo-400" />
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('recentActivity.title')}
              </h3>
            </div>
            <Link
              href={`/${locale}/behaviour/incidents`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('recentActivity.viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {recentActivity.slice(0, 8).map((item) => {
              const { icon: Icon, bg, fg } = ACTIVITY_ICON[item.kind];
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg} ${fg}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="truncate text-xs text-text-tertiary">
                      {item.actor_name ?? t('recentActivity.system')}
                      <span className="mx-1.5 text-text-tertiary/60">·</span>
                      {relativeFromNow(item.occurred_at, t)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-tertiary opacity-60 rtl:rotate-180" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state for brand-new tenants — no incidents, no recognition */}
      {!isLoading && recentActivity.length === 0 && recognitionPreview.length === 0 && (
        <section className="rounded-2xl border border-dashed border-border bg-surface-secondary/40 px-6 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-text-tertiary">
            <Shield className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-text-primary">{t('emptyState.title')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('emptyState.description')}</p>
          <div className="mt-4 flex justify-center">
            <Link href={`/${locale}/behaviour/incidents/new`}>
              <Button size="sm">
                <BookmarkCheck className="me-1.5 h-4 w-4" />
                {t('emptyState.cta')}
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function feedIncidentsToActivity(incidents: IncidentRow[], locale: string): ActivityItem[] {
  return incidents.map((incident) => {
    const subject = incident.participants?.[0]?.student;
    const subjectName = subject
      ? `${subject.first_name ?? ''} ${subject.last_name ?? ''}`.trim()
      : null;
    const actor = incident.reported_by
      ? `${incident.reported_by.first_name ?? ''} ${incident.reported_by.last_name ?? ''}`.trim()
      : null;
    const kind: ActivityKind = incident.polarity === 'positive' ? 'recognition' : 'incident';
    const categoryName = incident.category?.name ?? null;
    const title = subjectName
      ? categoryName
        ? `${categoryName} — ${subjectName}`
        : subjectName
      : (categoryName ?? incident.description ?? '');
    return {
      id: incident.id,
      kind,
      title: title || incident.description || '',
      actor_name: actor && actor.length > 0 ? actor : null,
      occurred_at: incident.occurred_at,
      href: `/${locale}/behaviour/incidents/${incident.id}`,
    };
  });
}
