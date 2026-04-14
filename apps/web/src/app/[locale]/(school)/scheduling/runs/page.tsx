'use client';

import { ChevronRight, Clock, Loader2, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface SchedulingRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'applied' | 'discarded';
  mode: 'auto' | 'hybrid';
  created_at: string;
  applied_at?: string | null;
  entries_generated?: number | null;
  entries_unassigned?: number | null;
  entries_pinned?: number | null;
  soft_preference_score?: number | null;
  soft_preference_max?: number | null;
  solver_duration_ms?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'applied':
      return 'info';
    case 'failed':
      return 'danger';
    case 'running':
      return 'warning';
    case 'queued':
      return 'secondary';
    case 'discarded':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function formatDuration(run: SchedulingRun): string {
  const ms = run.solver_duration_ms;
  if (ms == null) return '—';
  const secs = Math.round(ms / 1000);
  if (secs < 1) return `${ms}ms`;
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function computeScore(run: SchedulingRun): number | null {
  const score = run.soft_preference_score;
  const max = run.soft_preference_max;
  if (score == null || max == null || max <= 0) return null;
  return Math.round((score / max) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulingRunsPage() {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState<string>('');
  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Load academic years
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years')
      .then((res) => {
        const data = res.data ?? [];
        setYears(data);
        if (data.length > 0) setSelectedYear(data[0]!.id);
      })
      .catch((err) => {
        console.error('[SchedulingRunsPage]', err);
      });
  }, []);

  // Load runs
  React.useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    apiClient<{ data: SchedulingRun[] }>(`/api/v1/scheduling-runs?academic_year_id=${selectedYear}`)
      .then((res) => setRuns(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingRunsPage]', err);
        return setRuns([]);
      })
      .finally(() => setLoading(false));
  }, [selectedYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('runs.title')}
        description={t('runs.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('runs.selectYear')} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={() => router.push(`/${locale}/scheduling/auto`)} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              {t('runs.generate')}
            </Button>
          </div>
        }
      />

      {/* Runs table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-text-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{tc('loading')}</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">{t('runs.noRuns')}</p>
            <p className="text-xs text-text-tertiary mt-1">{t('runs.noRunsHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('runs.dateCol')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('auto.runMode')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('auto.runStatus')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('runs.assignedCol')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('auto.entriesUnassigned')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('runs.scoreCol')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {t('auto.runDuration')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    {tc('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const score = computeScore(run);
                  return (
                    <tr
                      key={run.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/${locale}/scheduling/runs/${run.id}/review`)}
                    >
                      <td className="px-4 py-3 text-text-primary">
                        {new Date(run.created_at).toLocaleDateString(locale, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="capitalize">
                          {run.mode}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(run.status)}>
                          {run.status === 'running' && (
                            <Loader2 className="h-3 w-3 animate-spin me-1" />
                          )}
                          {t(`auto.${run.status}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-text-primary">
                        {run.entries_generated ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-secondary">
                        {run.entries_unassigned ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {score != null ? (
                          <span
                            className={`font-mono font-semibold ${
                              score >= 80
                                ? 'text-green-600 dark:text-green-400'
                                : score >= 60
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                        {formatDuration(run)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/${locale}/scheduling/runs/${run.id}/review`);
                          }}
                          className="text-xs text-brand hover:underline flex items-center gap-1"
                        >
                          {t('auto.viewReview')}
                          <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
