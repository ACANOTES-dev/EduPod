'use client';

import { Badge } from '@school/ui';
import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkRow {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  status: string;
  max_points: number | null;
  subject: { id: string; name: string } | null;
  assigned_by: { id: string; first_name: string; last_name: string } | null;
}

interface HomeworkListResponse {
  data: HomeworkRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface DiaryHomeworkSectionProps {
  classId: string | null;
  date: string; // YYYY-MM-DD
}

// ─── Type badge colours ───────────────────────────────────────────────────────

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'info'> = {
  written: 'default',
  reading: 'secondary',
  research: 'info',
  revision: 'secondary',
  project_work: 'default',
  online_activity: 'info',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DiaryHomeworkSection({ classId, date }: DiaryHomeworkSectionProps) {
  const t = useTranslations('diary');
  const [items, setItems] = React.useState<HomeworkRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!classId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '50',
          due_date_from: date,
          due_date_to: date,
        });
        const res = await apiClient<HomeworkListResponse>(
          `/api/v1/homework/by-class/${classId}?${params.toString()}`,
        );
        if (!cancelled) setItems(res.data);
      } catch (err) {
        console.error('[DiaryHomeworkSection.load]', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [classId, date]);

  return (
    <div className="bg-card rounded-lg border p-4 md:p-6">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <BookOpen className="h-4 w-4" />
        {t('homework')}
      </h3>
      <div>
        {!classId ? (
          <p className="text-muted-foreground text-sm">{t('noClass')}</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noHomework')}</p>
        ) : (
          <ul className="divide-y">
            {items.map((hw) => (
              <li key={hw.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
                {hw.subject && (
                  <Badge variant="secondary" className="text-xs">
                    {hw.subject.name}
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {hw.title}
                </span>
                {hw.due_time && (
                  <span className="text-muted-foreground text-xs">
                    {hw.due_time}
                  </span>
                )}
                <Badge variant={TYPE_VARIANT[hw.homework_type] ?? 'info'} className="text-xs">
                  {t(`homeworkType.${hw.homework_type}` as Parameters<typeof t>[0])}
                </Badge>
                {hw.max_points != null && (
                  <span className="text-muted-foreground text-xs">
                    {hw.max_points} pts
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
