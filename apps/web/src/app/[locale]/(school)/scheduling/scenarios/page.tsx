'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import {
  BarChart3,
  ChevronRight,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioStatus = 'draft' | 'solved' | 'approved' | 'rejected';

interface SchedulingRun {
  id: string;
  name: string;
  created_at: string;
}

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  status: ScenarioStatus;
  base_run_id: string | null;
  base_run_name: string | null;
  created_by_name: string;
  created_at: string;
  metrics: {
    room_utilisation: number | null;
    teacher_utilisation: number | null;
    avg_gaps: number | null;
    preference_score: number | null;
    unassigned_slots: number | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: ScenarioStatus): 'default' | 'secondary' | 'danger' {
  if (status === 'approved') return 'default';
  if (status === 'rejected') return 'danger';
  return 'secondary';
}

function statusColour(status: ScenarioStatus): string {
  if (status === 'approved') return 'text-green-600';
  if (status === 'rejected') return 'text-red-600';
  if (status === 'solved') return 'text-blue-600';
  return 'text-text-secondary';
}

// ─── Create Scenario Modal ────────────────────────────────────────────────────

function CreateScenarioModal({
  open,
  onOpenChange,
  runs,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runs: SchedulingRun[];
  onSubmit: (values: { name: string; description: string; base_run_id: string }) => Promise<void>;
}) {
  const t = useTranslations('scheduling.scenarios');
  const tc = useTranslations('common');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [baseRunId, setBaseRunId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) { setName(''); setDescription(''); setBaseRunId(''); setError(''); }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { setError(t('nameRequired')); return; }
    setLoading(true);
    setError('');
    try {
      await onSubmit({ name, description, base_run_id: baseRunId });
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('createScenario')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('scenarioName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('scenarioNamePlaceholder')} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('scenarioDescription')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('baseRun')}</Label>
            <Select value={baseRunId} onValueChange={setBaseRunId}>
              <SelectTrigger><SelectValue placeholder={t('baseRunPlaceholder')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('startFresh')}</SelectItem>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name ?? new Date(r.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{tc('cancel')}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('createScenario')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({
  open,
  onOpenChange,
  scenarios,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scenarios: Scenario[];
}) {
  const t = useTranslations('scheduling.scenarios');
  const [aId, setAId] = React.useState('');
  const [bId, setBId] = React.useState('');

  const solvedScenarios = scenarios.filter((s) => s.status === 'solved' || s.status === 'approved');
  const aScenario = solvedScenarios.find((s) => s.id === aId);
  const bScenario = solvedScenarios.find((s) => s.id === bId);

  const metricRows: Array<{ key: keyof NonNullable<Scenario['metrics']>; label: string; format: (v: number) => string; higherIsBetter: boolean }> = [
    { key: 'room_utilisation', label: t('roomUtilisation'), format: (v) => `${Math.round(v)}%`, higherIsBetter: true },
    { key: 'teacher_utilisation', label: t('teacherUtilisation'), format: (v) => `${Math.round(v)}%`, higherIsBetter: true },
    { key: 'avg_gaps', label: t('avgGaps'), format: (v) => v.toFixed(1), higherIsBetter: false },
    { key: 'preference_score', label: t('preferenceScore'), format: (v) => `${Math.round(v)}%`, higherIsBetter: true },
    { key: 'unassigned_slots', label: t('unassignedSlots'), format: (v) => String(Math.round(v)), higherIsBetter: false },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('compareScenarios')}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t('scenarioA')}</Label>
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger><SelectValue placeholder={t('selectScenario')} /></SelectTrigger>
              <SelectContent>{solvedScenarios.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('scenarioB')}</Label>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger><SelectValue placeholder={t('selectScenario')} /></SelectTrigger>
              <SelectContent>{solvedScenarios.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {aScenario && bScenario && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">{t('metric')}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-tertiary uppercase">{aScenario.name}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-tertiary uppercase">{bScenario.name}</th>
                </tr>
              </thead>
              <tbody>
                {metricRows.map(({ key, label, format, higherIsBetter }) => {
                  const aVal = aScenario.metrics?.[key] ?? null;
                  const bVal = bScenario.metrics?.[key] ?? null;
                  const aWins = aVal !== null && bVal !== null && (higherIsBetter ? aVal > bVal : aVal < bVal);
                  const bWins = aVal !== null && bVal !== null && (higherIsBetter ? bVal > aVal : bVal < aVal);
                  return (
                    <tr key={key} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 text-text-secondary">{label}</td>
                      <td className={`px-4 py-3 text-center font-medium ${aWins ? 'text-green-600' : ''}`}>
                        {aVal !== null ? format(aVal) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-center font-medium ${bWins ? 'text-green-600' : ''}`}>
                        {bVal !== null ? format(bVal) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const t = useTranslations('scheduling.scenarios');
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [runs, setRuns] = React.useState<SchedulingRun[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [solvingId, setSolvingId] = React.useState<string | null>(null);

  const fetchScenarios = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: Scenario[] }>('/api/v1/scheduling/scenarios?pageSize=50');
      setScenarios(res.data ?? []);
    } catch {
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchScenarios();
    apiClient<{ data: SchedulingRun[] }>('/api/v1/scheduling-runs?status=applied&pageSize=50')
      .then((res) => setRuns(res.data ?? []))
      .catch(() => setRuns([]));
  }, [fetchScenarios]);

  const handleCreate = async (values: { name: string; description: string; base_run_id: string }) => {
    await apiClient('/api/v1/scheduling/scenarios', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name,
        description: values.description || null,
        base_run_id: values.base_run_id === '__none__' ? null : values.base_run_id || null,
      }),
    });
    toast.success(t('scenarioCreated'));
    void fetchScenarios();
  };

  const handleRunSolver = async (scenarioId: string) => {
    setSolvingId(scenarioId);
    try {
      await apiClient(`/api/v1/scheduling/scenarios/${scenarioId}/solve`, { method: 'POST' });
      toast.success(t('solverStarted'));
      void fetchScenarios();
    } catch {
      toast.error(t('solverFailed'));
    } finally {
      setSolvingId(null);
    }
  };

  const hasSolved = scenarios.some((s) => s.status === 'solved' || s.status === 'approved');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasSolved && (
              <Button variant="outline" onClick={() => setCompareOpen(true)}>
                <BarChart3 className="h-4 w-4 me-2" />
                {t('compare')}
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 me-2" />
              {t('createScenario')}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />)}
        </div>
      ) : scenarios.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <GitBranch className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{t('noScenarios')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('noScenariosHint')}</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t('createScenario')}
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {scenarios.map((scenario) => (
            <li key={scenario.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-text-primary">{scenario.name}</p>
                    <Badge variant={statusVariant(scenario.status)}>
                      <span className={statusColour(scenario.status)}>{scenario.status}</span>
                    </Badge>
                  </div>
                  {scenario.description && (
                    <p className="text-sm text-text-secondary">{scenario.description}</p>
                  )}
                  <p className="text-xs text-text-tertiary">
                    {t('basedOn')}: {scenario.base_run_name ?? t('noBase')} &middot; {t('createdBy')}: {scenario.created_by_name}
                  </p>
                  {scenario.metrics && (
                    <div className="flex flex-wrap gap-4 pt-1">
                      {scenario.metrics.room_utilisation !== null && (
                        <div className="text-xs">
                          <span className="text-text-tertiary">{t('roomUtil')}</span>{' '}
                          <span className="font-medium text-text-primary">{Math.round(scenario.metrics.room_utilisation)}%</span>
                        </div>
                      )}
                      {scenario.metrics.teacher_utilisation !== null && (
                        <div className="text-xs">
                          <span className="text-text-tertiary">{t('teacherUtil')}</span>{' '}
                          <span className="font-medium text-text-primary">{Math.round(scenario.metrics.teacher_utilisation)}%</span>
                        </div>
                      )}
                      {scenario.metrics.unassigned_slots !== null && (
                        <div className="text-xs">
                          <span className="text-text-tertiary">{t('unassigned')}</span>{' '}
                          <span className={`font-medium ${scenario.metrics.unassigned_slots > 0 ? 'text-warning-600' : 'text-green-600'}`}>
                            {scenario.metrics.unassigned_slots}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {scenario.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={solvingId === scenario.id}
                      onClick={() => void handleRunSolver(scenario.id)}
                    >
                      {solvingId === scenario.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin me-1" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 me-1" />
                      )}
                      {t('runSolver')}
                    </Button>
                  )}
                  <ChevronRight className="h-5 w-5 text-text-tertiary rtl:rotate-180" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateScenarioModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        runs={runs}
        onSubmit={handleCreate}
      />

      <CompareModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        scenarios={scenarios}
      />
    </div>
  );
}
