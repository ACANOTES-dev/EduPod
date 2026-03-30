'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClosureRow {
  id: string;
  closure_date: string;
  reason: string;
  affects_scope: string;
  scope_entity_id: string | null;
}

interface ClosureListResponse {
  data: ClosureRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface DiaryEventCardProps {
  date: string; // YYYY-MM-DD
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiaryEventCard({ date }: DiaryEventCardProps) {
  const t = useTranslations('diary');
  const [closures, setClosures] = React.useState<ClosureRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          start_date: date,
          end_date: date,
          page: '1',
          pageSize: '50',
        });
        const res = await apiClient<ClosureListResponse>(
          `/api/v1/school-closures?${params.toString()}`,
        );
        if (!cancelled) setClosures(res.data);
      } catch (err) {
        console.error('[DiaryEventCard.load]', err);
        if (!cancelled) setClosures([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="bg-card rounded-lg border p-4 md:p-6">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <CalendarDays className="h-4 w-4" />
        {t('events')}
      </h3>
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : closures.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noEvents')}</p>
        ) : (
          <ul className="space-y-2">
            {closures.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30"
              >
                <p className="text-sm font-medium">{c.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {t(`closureScope.${c.affects_scope}` as Parameters<typeof t>[0])}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
