'use client';

import { ArrowLeft, GitCompare, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

import { ScheduleGrid, type PeriodSlot, type ScheduleEntry } from '../[id]/_components/schedule-grid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulingRun {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  assigned_count: number;
  unassigned_count: number;
  score?: number;
}

interface RunCompareData {
  year_groups: Array<{ year_group_id: string; name: string }>;
  entries: ScheduleEntry[];
  period_grids: Record<string, PeriodSlot[]>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const searchParams = useSearchParams();

  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [runAId, setRunAId] = React.useState(searchParams.get('run_a') ?? '');
  const [runBId, setRunBId] = React.useState(searchParams.get('run_b') ?? '');
  const [dataA, setDataA] = React.useState<RunCompareData | null>(null);
  const [dataB, setDataB] = React.useState<RunCompareData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>('');

  // Load available runs
  React.useEffect(() => {
    apiClient<{ data: SchedulingRun[] }>('/api/v1/scheduling-runs')
      .then((res) => {
        const data = (res.data ?? []).filter(
          (r) => r.status === 'completed' || r.status === 'applied',
        );
        setRuns(data);
      })
      .catch(() => setRuns([]));
  }, []);

  // Load run data when selections change
  React.useEffect(() => {
    if (!runAId || !runBId || runAId === runBId) {
      setDataA(null);
      setDataB(null);
      return;
    }

    setLoading(true);
    Promise.all([
      apiClient<RunCompareData>(`/api/v1/scheduling-runs/${runAId}/detail`),
      apiClient<RunCompareData>(`/api/v1/scheduling-runs/${runBId}/detail`),
    ])
      .then(([a, b]) => {
        setDataA(a);
        setDataB(b);
        if (a.year_groups.length > 0 && !activeTab) {
          setActiveTab(a.year_groups[0]!.year_group_id);
        }
      })
      .catch(() => {
        setDataA(null);
        setDataB(null);
      })
      .finally(() => setLoading(false));
  }, [runAId, runBId, activeTab]);

  // Compute diff: entries that differ between runs
  const diffCells = React.useMemo(() => {
    if (!dataA || !dataB) return new Set<string>();
    const diff = new Set<string>();

    const indexA = new Map<string, ScheduleEntry>();
    const indexB = new Map<string, ScheduleEntry>();

    for (const e of dataA.entries.filter((e) => e.year_group_id === activeTab)) {
      indexA.set(`${e.weekday}:${e.period_order}`, e);
    }
    for (const e of dataB.entries.filter((e) => e.year_group_id === activeTab)) {
      indexB.set(`${e.weekday}:${e.period_order}`, e);
    }

    // Check A entries against B
    for (const [key, entryA] of indexA) {
      const entryB = indexB.get(key);
      if (!entryB) {
        diff.add(key);
      } else if (
        entryA.subject_name !== entryB.subject_name ||
        entryA.teacher_name !== entryB.teacher_name ||
        entryA.room_name !== entryB.room_name
      ) {
        diff.add(key);
      }
    }

    // Check B entries not in A
    for (const key of indexB.keys()) {
      if (!indexA.has(key)) {
        diff.add(key);
      }
    }

    return diff;
  }, [dataA, dataB, activeTab]);

  // Build diff violations map (visual highlighting)
  const diffViolationsA = React.useMemo(() => {
    const map: Record<string, Array<{ tier: 3; code: string; message: string }>> = {};
    for (const key of diffCells) {
      const cellKey = `${activeTab}:${key.replace(':', ':')}`;
      map[cellKey] = [{ tier: 3, code: 'DIFF', message: t('runs.diffFromOtherRun') }];
    }
    return map;
  }, [diffCells, activeTab, t]);

  // Compute summary
  const summaryA = runs.find((r) => r.id === runAId);
  const summaryB = runs.find((r) => r.id === runBId);
  const entriesACount = dataA?.entries.filter((e) => e.year_group_id === activeTab).length ?? 0;
  const entriesBCount = dataB?.entries.filter((e) => e.year_group_id === activeTab).length ?? 0;

  const yearGroups = dataA?.year_groups ?? dataB?.year_groups ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('runs.compareTitle')}
        description={t('runs.compareDescription')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/${locale}/scheduling/runs`)}
          >
            <ArrowLeft className="h-4 w-4 me-1.5 rtl:rotate-180" />
            {t('runs.backToRuns')}
          </Button>
        }
      />

      {/* Run selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            {t('runs.runA')}
          </label>
          <Select value={runAId} onValueChange={setRunAId}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder={t('runs.selectRun')} />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleDateString()} — {r.mode} ({r.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {summaryA && (
            <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
              <Badge variant="secondary">{summaryA.assigned_count} {t('runs.assignedCol')}</Badge>
              {summaryA.score != null && (
                <Badge variant="default">{t('runs.scoreCol')}: {summaryA.score}</Badge>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            {t('runs.runB')}
          </label>
          <Select value={runBId} onValueChange={setRunBId}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder={t('runs.selectRun')} />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleDateString()} — {r.mode} ({r.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {summaryB && (
            <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
              <Badge variant="secondary">{summaryB.assigned_count} {t('runs.assignedCol')}</Badge>
              {summaryB.score != null && (
                <Badge variant="default">{t('runs.scoreCol')}: {summaryB.score}</Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Diff summary */}
      {dataA && dataB && (
        <div className="rounded-xl border border-border bg-surface p-4 flex items-center gap-4 flex-wrap">
          <GitCompare className="h-5 w-5 text-brand" />
          <span className="text-sm text-text-primary">
            <strong>{diffCells.size}</strong> {t('runs.cellsDiffer')}
          </span>
          <span className="text-sm text-text-secondary">
            {t('runs.runA')}: {entriesACount} {t('runs.entries')} |{' '}
            {t('runs.runB')}: {entriesBCount} {t('runs.entries')}
          </span>
        </div>
      )}

      {/* Year group tabs */}
      {yearGroups.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
          {yearGroups.map((yg) => (
            <button
              key={yg.year_group_id}
              type="button"
              onClick={() => setActiveTab(yg.year_group_id)}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === yg.year_group_id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {yg.name}
            </button>
          ))}
        </div>
      )}

      {/* Side-by-side grids */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-text-tertiary">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{tc('loading')}</span>
        </div>
      ) : dataA && dataB ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Run A grid */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">{t('runs.runA')}</h3>
            <ScheduleGrid
              yearGroupId={activeTab}
              entries={dataA.entries.filter((e) => e.year_group_id === activeTab)}
              periodGrid={dataA.period_grids[activeTab] ?? []}
              violations={diffViolationsA}
              readOnly
            />
          </div>

          {/* Run B grid */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">{t('runs.runB')}</h3>
            <ScheduleGrid
              yearGroupId={activeTab}
              entries={dataB.entries.filter((e) => e.year_group_id === activeTab)}
              periodGrid={dataB.period_grids[activeTab] ?? []}
              violations={diffViolationsA}
              readOnly
            />
          </div>
        </div>
      ) : runAId && runBId && runAId !== runBId ? (
        <div className="py-16 text-center text-sm text-text-tertiary">
          {t('runs.selectBothRuns')}
        </div>
      ) : (
        <div className="py-16 text-center text-sm text-text-tertiary">
          {t('runs.selectBothRuns')}
        </div>
      )}
    </div>
  );
}
