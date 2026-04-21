'use client';

import { Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HouseStanding {
  // Backend returns both `id` and (legacy) `house_id`; accept either.
  id?: string;
  house_id?: string;
  name: string;
  color: string;
  icon: string | null;
  total_points: number;
  member_count?: number;
  rank: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourHousesPage() {
  const t = useTranslations('behaviour.houses');
  const [houses, setHouses] = React.useState<HouseStanding[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient<{ data: HouseStanding[] } | HouseStanding[]>(
        '/api/v1/behaviour/recognition/houses',
        { silent: true },
      );
      const data = Array.isArray(res) ? res : (res.data ?? []);
      setHouses(data);
    } catch (err: unknown) {
      console.error('[BehaviourHousesPage]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {loadError && (
        <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
          <p className="text-sm text-text-primary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : houses.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <Trophy className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('empty')}</p>
          <Link href="/settings/behaviour-houses" className="text-xs text-primary-600 underline">
            {t('configureLink')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {houses.map((house) => (
            <article
              key={house.id ?? house.house_id ?? house.name}
              className="relative overflow-hidden rounded-xl border border-border bg-surface p-5"
            >
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ backgroundColor: house.color }}
              />
              <div className="flex items-start gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white"
                  style={{ backgroundColor: house.color }}
                >
                  {house.icon ?? house.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="truncate text-base font-semibold text-text-primary">
                      {house.name}
                    </h2>
                    <span className="shrink-0 text-xs text-text-tertiary">#{house.rank}</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-text-primary">{house.total_points}</p>
                  <p className="text-xs text-text-tertiary">{t('points')}</p>
                  {typeof house.member_count === 'number' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                      <Users className="h-3 w-3" aria-hidden="true" />
                      {t('memberCount', { count: house.member_count })}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
