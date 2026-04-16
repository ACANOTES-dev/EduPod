'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { UtilisationBadge } from './dashboard-parts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroupRow {
  year_group_id: string;
  year_group_name: string;
  student_count: number;
  class_count: number;
}

interface ClassRow {
  class_id: string;
  class_name: string;
  year_group_name: string | null;
  student_count: number;
  max_capacity: number;
}

interface EnrollmentTableProps {
  locale: string;
  yearGroups: YearGroupRow[];
  classes: ClassRow[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EnrollmentTable({ locale, yearGroups, classes }: EnrollmentTableProps) {
  const t = useTranslations('peopleHub');
  const [expandedYg, setExpandedYg] = React.useState<Set<string>>(new Set());

  const toggleYg = (ygId: string) => {
    setExpandedYg((prev) => {
      const next = new Set(prev);
      if (next.has(ygId)) next.delete(ygId);
      else next.add(ygId);
      return next;
    });
  };

  const classesByYg = React.useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const cls of classes) {
      const ygName = cls.year_group_name ?? 'Unassigned';
      const list = map.get(ygName) ?? [];
      list.push(cls);
      map.set(ygName, list);
    }
    return map;
  }, [classes]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600" />
      <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{t('enrollment.title')}</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">{t('enrollment.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/classes`}
          className="flex items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
        >
          {t('enrollment.viewAll')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-text-tertiary">
              <th className="py-3 pe-3 ps-5 text-start font-medium sm:ps-6">
                {t('enrollment.yearGroup')}
              </th>
              <th className="py-3 pe-3 text-end font-medium">{t('enrollment.students')}</th>
              <th className="py-3 pe-3 text-end font-medium">{t('enrollment.classes')}</th>
              <th className="py-3 pe-5 text-end font-medium sm:pe-6">
                {t('enrollment.utilisation')}
              </th>
            </tr>
          </thead>
          <tbody>
            {yearGroups.map((yg) => {
              const isExpanded = expandedYg.has(yg.year_group_id);
              const ygClasses = classesByYg.get(yg.year_group_name) ?? [];
              const totalCapacity = ygClasses.reduce((sum, c) => sum + c.max_capacity, 0);
              const utilisationPct =
                totalCapacity > 0 ? Math.round((yg.student_count / totalCapacity) * 100) : null;
              return (
                <React.Fragment key={yg.year_group_id}>
                  <tr
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-secondary last:border-0"
                    onClick={() => toggleYg(yg.year_group_id)}
                  >
                    <td className="py-3 pe-3 ps-5 font-medium text-text-primary sm:ps-6">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center text-xs text-text-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          ▸
                        </span>
                        {yg.year_group_name}
                      </div>
                    </td>
                    <td className="py-3 pe-3 text-end font-semibold text-text-primary">
                      {yg.student_count}
                    </td>
                    <td className="py-3 pe-3 text-end text-text-secondary">{yg.class_count}</td>
                    <td className="py-3 pe-5 text-end sm:pe-6">
                      {utilisationPct !== null ? (
                        <UtilisationBadge pct={utilisationPct} />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded &&
                    ygClasses.map((cls) => {
                      const clsPct =
                        cls.max_capacity > 0
                          ? Math.round((cls.student_count / cls.max_capacity) * 100)
                          : null;
                      return (
                        <tr
                          key={cls.class_id}
                          className="border-b border-border/30 bg-surface-secondary/50 last:border-0"
                        >
                          <td className="py-2 pe-3 ps-12 text-text-secondary sm:ps-14">
                            {cls.class_name}
                          </td>
                          <td className="py-2 pe-3 text-end text-text-secondary">
                            {cls.student_count}
                          </td>
                          <td className="py-2 pe-3 text-end font-mono text-xs text-text-tertiary">
                            / {cls.max_capacity}
                          </td>
                          <td className="py-2 pe-5 text-end sm:pe-6">
                            {clsPct !== null ? (
                              <UtilisationBadge pct={clsPct} />
                            ) : (
                              <span className="text-text-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
