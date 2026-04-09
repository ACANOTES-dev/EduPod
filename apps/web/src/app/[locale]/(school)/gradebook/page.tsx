'use client';

import { BookOpen, GraduationCap } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  id: string;
  class_id: string;
  class_name?: string;
  class_entity?: { id: string; name: string };
}

interface AssessmentsResponse {
  data: Assessment[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
}

interface ClassRecord {
  id: string;
  name: string;
  year_group?: { id: string; name: string } | null;
}

interface ClassCard {
  class_id: string;
  class_name: string;
  assessment_count: number;
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
}

interface GroupedCards {
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
  cards: ClassCard[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradebookPage() {
  const t = useTranslations('gradebook');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [grouped, setGrouped] = React.useState<GroupedCards[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [yearGroupsRes, classesRes, assessmentsRes] = await Promise.all([
          apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
          apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=100'),
          apiClient<AssessmentsResponse>(
            '/api/v1/gradebook/assessments?pageSize=100&exclude_cancelled=true',
          ),
        ]);

        if (cancelled) return;

        // Build assessment counts per class
        const countsByClass = new Map<string, number>();
        for (const a of assessmentsRes.data ?? []) {
          if (!a.class_id) continue;
          countsByClass.set(a.class_id, (countsByClass.get(a.class_id) ?? 0) + 1);
        }

        // Build year_group lookup (id -> { name, order })
        const yearGroupInfo = new Map<string, { name: string; order: number }>();
        for (const yg of yearGroupsRes.data ?? []) {
          yearGroupInfo.set(yg.id, { name: yg.name, order: yg.display_order ?? 0 });
        }

        // Build class cards — only for classes that have assessments
        const cards: ClassCard[] = [];
        for (const cls of classesRes.data ?? []) {
          const count = countsByClass.get(cls.id);
          if (!count) continue;
          const ygId = cls.year_group?.id ?? null;
          const ygInfo = ygId ? yearGroupInfo.get(ygId) : null;
          cards.push({
            class_id: cls.id,
            class_name: cls.name,
            assessment_count: count,
            year_group_id: ygId,
            year_group_name: cls.year_group?.name ?? 'Unassigned',
            year_group_order: ygInfo?.order ?? 999,
          });
        }

        // Group by year_group
        const groupMap = new Map<string, GroupedCards>();
        for (const card of cards) {
          const key = card.year_group_id ?? '__unassigned';
          const existing = groupMap.get(key);
          if (existing) {
            existing.cards.push(card);
          } else {
            groupMap.set(key, {
              year_group_id: card.year_group_id,
              year_group_name: card.year_group_name,
              year_group_order: card.year_group_order,
              cards: [card],
            });
          }
        }

        // Sort groups by display_order, then cards within each group by name
        const sortedGroups = Array.from(groupMap.values())
          .sort((a, b) => a.year_group_order - b.year_group_order)
          .map((g) => ({
            ...g,
            cards: g.cards.slice().sort((a, b) => a.class_name.localeCompare(b.class_name)),
          }));

        setGrouped(sortedGroups);
      } catch (err) {
        console.error('[GradebookPage]', err);
        setGrouped([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8 pb-8">
      <PageHeader title={t('title')} />

      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-surface-secondary" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noClasses')} />
      ) : (
        <div className="space-y-10">
          {grouped.map((group) => (
            <section key={group.year_group_id ?? '__unassigned'} className="space-y-4">
              {/* Year group header */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                  <GraduationCap className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    {group.year_group_name}
                  </h2>
                  <p className="text-xs text-text-tertiary">
                    {group.cards.length} {group.cards.length === 1 ? 'class' : 'classes'}
                  </p>
                </div>
                <div className="flex-1 border-t border-border/60" />
              </div>

              {/* Class cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.cards.map((card) => (
                  <button
                    key={card.class_id}
                    onClick={() => router.push(`/${locale}/gradebook/${card.class_id}`)}
                    className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 text-start shadow-sm transition-all hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    {/* Decorative gradient accent */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 opacity-80" />

                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-2xl font-bold text-text-primary tracking-tight">
                        {card.class_name}
                      </h3>
                      <BookOpen className="h-5 w-5 text-primary-500/70 transition-colors group-hover:text-primary-600" />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-primary-700 tabular-nums">
                        {card.assessment_count}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        {card.assessment_count === 1 ? 'assessment' : 'assessments'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
