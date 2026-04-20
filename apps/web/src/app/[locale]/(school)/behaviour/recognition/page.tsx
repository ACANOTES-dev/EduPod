'use client';

import {
  Award,
  CheckCircle,
  Crown,
  Medal,
  Shield,
  Sparkles,
  Star,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecognitionItem {
  id: string;
  student: { first_name: string; last_name: string } | null;
  award: { name: string; icon: string | null; color: string | null } | null;
  category: { name: string; color: string | null } | null;
  points: number;
  message: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  awarded_by_user: { first_name: string; last_name: string } | null;
}

interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  year_group: string | null;
  total_points: number;
}

interface HouseStanding {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  total_points: number;
  rank: number;
}

interface PendingApproval {
  id: string;
  student: { first_name: string; last_name: string } | null;
  award: { name: string } | null;
  category: { name: string } | null;
  points: number;
  message: string | null;
  created_at: string;
  awarded_by_user: { first_name: string; last_name: string } | null;
}

interface AcademicYear {
  id: string;
  name: string;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['wall', 'leaderboard', 'houses', 'pending'] as const;
const TAB_ICONS = { wall: Star, leaderboard: Trophy, houses: Shield, pending: Award } as const;

type TabKey = (typeof TAB_KEYS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecognitionWallPage() {
  const t = useTranslations('behaviour.recognition');
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = React.useState<TabKey>(
    (searchParams?.get('tab') as TabKey) ?? 'wall',
  );

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.toString());
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Celebratory hero strip */}
      <section className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-rose-50 p-5">
        <div className="absolute -end-6 -top-6 h-32 w-32 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute -bottom-4 -start-4 h-24 w-24 rounded-full bg-rose-200/30 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">{t('hero.title')}</h2>
            <p className="mt-0.5 text-xs text-text-secondary">{t('hero.body')}</p>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TAB_KEYS.map((tabKey) => {
            const TabIcon = TAB_ICONS[tabKey];
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => handleTabChange(tabKey)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tabKey
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t(`tabs.${tabKey}` as Parameters<typeof t>[0])}
                </span>
                <span className="sm:hidden">
                  {t(`tabs.${tabKey}Short` as Parameters<typeof t>[0])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'wall' && <WallTab />}
      {activeTab === 'leaderboard' && <LeaderboardTab />}
      {activeTab === 'houses' && <HousesTab />}
      {activeTab === 'pending' && <PendingApprovalsTab />}
    </div>
  );
}

// ─── Wall Tab ─────────────────────────────────────────────────────────────────

function WallTab() {
  const t = useTranslations('behaviour.recognition');
  const [items, setItems] = React.useState<RecognitionItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('current');

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20')
      .then((res) => setAcademicYears(res.data ?? []))
      .catch((err) => {
        console.error('[BehaviourRecognitionPage]', err);
      });
  }, []);

  const fetchWall = React.useCallback(async (year: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50', status: 'published' });
      if (year !== 'current') params.set('academic_year_id', year);
      const res = await apiClient<{ data: RecognitionItem[] }>(
        `/api/v1/behaviour/recognition?${params.toString()}`,
      );
      setItems(res.data ?? []);
    } catch (err) {
      console.error('[BehaviourRecognitionPage]', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchWall(yearFilter);
  }, [yearFilter, fetchWall]);

  const getStudentInitial = (student: RecognitionItem['student']) => {
    if (!student) return '?';
    return `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('academicYear')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{t('filters.currentYear')}</SelectItem>
            {academicYears.map((ay) => (
              <SelectItem key={ay.id} value={ay.id}>
                {ay.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('noRecognition')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start gap-3">
                {/* Avatar circle */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    backgroundColor: item.award?.color ?? item.category?.color ?? '#6366F1',
                  }}
                >
                  {getStudentInitial(item.student)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {item.student
                      ? `${item.student.first_name} ${item.student.last_name.charAt(0)}.`
                      : t('unknownStudent')}
                  </p>
                  {item.award && (
                    <Badge
                      variant="secondary"
                      className="mt-0.5 text-xs"
                      style={
                        item.award.color
                          ? { borderColor: item.award.color, color: item.award.color }
                          : undefined
                      }
                    >
                      {item.award.icon && <span className="me-1">{item.award.icon}</span>}
                      {item.award.name}
                    </Badge>
                  )}
                  {!item.award && item.category && (
                    <Badge variant="secondary" className="mt-0.5 text-xs">
                      {item.category.name}
                    </Badge>
                  )}
                </div>
                {item.points > 0 && (
                  <span className="shrink-0 text-sm font-semibold text-green-600">
                    +{item.points}
                  </span>
                )}
              </div>

              {item.message && (
                <p className="line-clamp-2 text-xs text-text-secondary">{item.message}</p>
              )}

              <p className="text-[11px] text-text-tertiary">
                {formatDate(item.published_at ?? item.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

function LeaderboardTab() {
  const t = useTranslations('behaviour.recognition');
  const [entries, setEntries] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState('year');

  const fetchLeaderboard = React.useCallback(async (p: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: p, pageSize: '50' });
      const res = await apiClient<{ data: LeaderboardEntry[] }>(
        `/api/v1/behaviour/recognition/leaderboard?${params.toString()}`,
      );
      setEntries(res.data ?? []);
    } catch (err) {
      console.error('[BehaviourRecognitionPage]', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLeaderboard(period);
  }, [period, fetchLeaderboard]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm font-medium text-text-secondary">{rank}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="year">{t('filters.thisYear')}</SelectItem>
            <SelectItem value="period">{t('filters.thisPeriod')}</SelectItem>
            <SelectItem value="all_time">{t('filters.allTime')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leaderboard table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('noLeaderboard')}</p>
      ) : (
        <>
          <Podium entries={entries.slice(0, 3)} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('columns.rank')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('columns.student')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('columns.yearGroup')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('columns.points')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.student_id}
                    className={`border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary ${
                      entry.rank <= 3 ? 'bg-surface-secondary/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {getRankIcon(entry.rank)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {entry.student_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {entry.year_group ?? '---'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <span className="text-sm font-semibold text-green-600">
                        {entry.total_points.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const t = useTranslations('behaviour.recognition');
  if (entries.length === 0) return null;

  // Order: 2nd / 1st / 3rd for visual podium effect on sm+
  const [first, second, third] = entries;
  const slots = [
    {
      entry: second,
      rank: 2,
      height: 'sm:h-32',
      glow: 'from-slate-200 to-slate-50',
      icon: Medal,
      iconColor: 'text-slate-400',
    },
    {
      entry: first,
      rank: 1,
      height: 'sm:h-40',
      glow: 'from-amber-200 to-yellow-50',
      icon: Crown,
      iconColor: 'text-amber-500',
    },
    {
      entry: third,
      rank: 3,
      height: 'sm:h-28',
      glow: 'from-amber-100 to-amber-50',
      icon: Trophy,
      iconColor: 'text-amber-700',
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-surface-secondary to-transparent p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {t('podium.title')}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        {slots.map((slot) => {
          if (!slot.entry) return <div key={slot.rank} className="hidden sm:block" />;
          const Icon = slot.icon;
          return (
            <div
              key={slot.entry.student_id}
              className={`flex flex-col items-center gap-2 rounded-xl border border-border bg-gradient-to-b ${slot.glow} p-4 ${slot.height} sm:justify-end`}
            >
              <div className={`${slot.iconColor} drop-shadow-sm`}>
                <Icon className="h-7 w-7" />
              </div>
              <p className="line-clamp-1 text-center text-sm font-semibold text-text-primary">
                {slot.entry.student_name}
              </p>
              <p className="text-xs text-text-tertiary">
                {slot.entry.year_group ?? t('podium.noYearGroup')}
              </p>
              <p className="text-xl font-bold text-text-primary">
                {slot.entry.total_points.toLocaleString()}
                <span className="ms-1 text-xs font-normal text-text-tertiary">{t('pts')}</span>
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                {t('podium.rank', { rank: slot.rank })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Houses Tab ───────────────────────────────────────────────────────────────

function HousesTab() {
  const t = useTranslations('behaviour.recognition');
  const [houses, setHouses] = React.useState<HouseStanding[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiClient<{ data: HouseStanding[] }>('/api/v1/behaviour/houses/standings')
      .then((res) => setHouses(res.data ?? []))
      .catch((err) => {
        console.error('[BehaviourRecognitionPage]', err);
        return setHouses([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const getRankLabel = (rank: number) => {
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : houses.length === 0 ? (
        <div className="py-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-tertiary">{t('noHouses')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {houses.map((house) => (
            <div
              key={house.id}
              className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-secondary"
            >
              {/* Color accent strip at top */}
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: house.color }}
              />

              <div className="flex items-start gap-3 pt-1">
                {/* Color swatch */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: house.color }}
                >
                  {house.icon ? (
                    <span className="text-lg">{house.icon}</span>
                  ) : (
                    <Shield className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{house.name}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {t('rankPlace', { rank: getRankLabel(house.rank) })}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-text-primary">
                  {house.total_points.toLocaleString()}
                </span>
                <span className="text-xs text-text-tertiary">{t('pts')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pending Approvals Tab ────────────────────────────────────────────────────

function PendingApprovalsTab() {
  const t = useTranslations('behaviour.recognition');
  const [items, setItems] = React.useState<PendingApproval[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  const fetchPending = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: PendingApproval[] }>(
        '/api/v1/behaviour/recognition?status=pending_approval&pageSize=50',
      );
      setItems(res.data ?? []);
    } catch (err) {
      console.error('[BehaviourRecognitionPage]', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      await apiClient(`/api/v1/behaviour/recognition/${id}/${action}`, {
        method: 'POST',
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      // handled by global error handler
      console.error('[setItems]', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-400/40" />
          <p className="mt-3 text-sm text-text-tertiary">{t('noPending')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isProcessing = processingId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {item.student
                        ? `${item.student.first_name} ${item.student.last_name}`
                        : t('unknownStudent')}
                    </span>
                    {item.award && (
                      <Badge variant="secondary" className="text-xs">
                        {item.award.name}
                      </Badge>
                    )}
                    {!item.award && item.category && (
                      <Badge variant="secondary" className="text-xs">
                        {item.category.name}
                      </Badge>
                    )}
                    {item.points > 0 && (
                      <span className="text-xs font-semibold text-green-600">
                        +{item.points}
                        {t('pts')}
                      </span>
                    )}
                  </div>

                  {item.message && (
                    <p className="line-clamp-1 text-xs text-text-secondary">{item.message}</p>
                  )}

                  <p className="text-[11px] text-text-tertiary">
                    {t('by')}{' '}
                    {item.awarded_by_user
                      ? `${item.awarded_by_user.first_name} ${item.awarded_by_user.last_name}`
                      : 'Unknown'}{' '}
                    &middot; {formatDate(item.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger-text hover:text-danger-text"
                    disabled={isProcessing}
                    onClick={() => void handleAction(item.id, 'reject')}
                  >
                    <XCircle className="me-1.5 h-4 w-4" />
                    {t('reject')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => void handleAction(item.id, 'approve')}
                  >
                    <CheckCircle className="me-1.5 h-4 w-4" />
                    {t('approve')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
