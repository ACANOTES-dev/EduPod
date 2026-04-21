'use client';

import { Award, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  year_group: string | null;
  total_points: number;
}

interface LeaderboardResponse {
  data: LeaderboardEntry[];
}

interface AcademicYear {
  id: string;
  name: string;
}

type Scope = 'year' | 'period' | 'all_time';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourLeaderboardPage() {
  const t = useTranslations('behaviour.leaderboard');
  const [scope, setScope] = React.useState<Scope>('year');
  const [yearId, setYearId] = React.useState<string>('current');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [entries, setEntries] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20', { silent: true })
      .then((res) => setAcademicYears(res.data ?? []))
      .catch((err) => console.error('[BehaviourLeaderboardPage]', err));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const qs = new URLSearchParams({ scope, pageSize: '50' });
      if (yearId !== 'current') qs.set('academic_year_id', yearId);
      const res = await apiClient<LeaderboardResponse>(
        `/api/v1/behaviour/recognition/leaderboard?${qs.toString()}`,
        { silent: true },
      );
      setEntries(res.data ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourLeaderboardPage]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [scope, yearId, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="year">{t('periods.year')}</SelectItem>
            <SelectItem value="period">{t('periods.period')}</SelectItem>
            <SelectItem value="all_time">{t('periods.allTime')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={yearId} onValueChange={setYearId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{t('currentYear')}</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError && (
        <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
          <p className="text-sm text-text-primary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <Trophy className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">#</th>
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('student')}
                </th>
                <th className="px-3 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('yearGroup')}
                </th>
                <th className="px-3 py-2 text-end text-xs font-medium text-text-secondary">
                  {t('points')}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.student_id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary"
                >
                  <td className="px-3 py-2.5 text-xs text-text-tertiary">
                    {entry.rank <= 3 ? (
                      <Award
                        className={`h-4 w-4 ${
                          entry.rank === 1
                            ? 'text-amber-500'
                            : entry.rank === 2
                              ? 'text-gray-400'
                              : 'text-amber-700'
                        }`}
                      />
                    ) : (
                      entry.rank
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm font-medium text-text-primary">
                    {entry.student_name}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-secondary">
                    {entry.year_group ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-end text-sm font-semibold text-text-primary">
                    {entry.total_points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
