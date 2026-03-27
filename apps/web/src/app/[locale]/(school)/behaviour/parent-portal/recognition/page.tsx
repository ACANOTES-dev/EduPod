'use client';

import { Award } from 'lucide-react';
import * as React from 'react';

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
  published_at: string | null;
  created_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentRecognitionWallPage() {
  const [items, setItems] = React.useState<RecognitionItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiClient<{ data: RecognitionItem[] }>(
      '/api/v1/parent/behaviour/recognition',
    )
      .then((res) => setItems(res.data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const getInitials = (student: RecognitionItem['student']) => {
    if (!student) return '?';
    return `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  };

  const getDisplayName = (student: RecognitionItem['student']) => {
    if (!student) return 'Unknown';
    return `${student.first_name} ${student.last_name.charAt(0)}.`;
  };

  const getAccentColor = (item: RecognitionItem) =>
    item.award?.color ?? item.category?.color ?? '#6366F1';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recognition Wall"
        description="Celebrating student achievements and positive behaviour"
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <Award className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">No awards published yet</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Check back soon to see recognised achievements.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const accentColor = getAccentColor(item);
            const awardOrCategory = item.award?.name ?? item.category?.name ?? null;

            return (
              <div
                key={item.id}
                className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
              >
                {/* Top accent bar */}
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: accentColor }}
                />

                <div className="mt-1 flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    {getInitials(item.student)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {getDisplayName(item.student)}
                    </p>

                    {awardOrCategory && (
                      <div className="mt-1 flex items-center gap-1">
                        {item.award?.icon ? (
                          <span className="text-base leading-none">{item.award.icon}</span>
                        ) : (
                          <Award className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
                        )}
                        <span
                          className="text-xs font-medium"
                          style={{ color: accentColor }}
                        >
                          {awardOrCategory}
                        </span>
                      </div>
                    )}
                  </div>

                  {item.points > 0 && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      +{item.points} pts
                    </span>
                  )}
                </div>

                {item.message && (
                  <p className="mt-3 line-clamp-2 text-xs text-text-secondary">
                    &ldquo;{item.message}&rdquo;
                  </p>
                )}

                <p className="mt-2 text-[11px] text-text-tertiary">
                  {formatDate(item.published_at ?? item.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
