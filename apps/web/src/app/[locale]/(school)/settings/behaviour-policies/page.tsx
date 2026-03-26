'use client';

import {
  Badge,
  Button,
  Checkbox,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
} from '@school/ui';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  Download,
  FlaskConical,
  GripVertical,
  Heart,
  History,
  Pencil,
  Play,
  Plus,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PolicyAction {
  id?: string;
  action_type: string;
  action_config: Record<string, unknown>;
  execution_order: number;
}

interface PolicyRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  stage: string;
  priority: number;
  match_strategy: string;
  stop_processing_stage: boolean;
  conditions: Record<string, unknown>;
  current_version: number;
  actions: PolicyAction[];
}

interface Category {
  id: string;
  name: string;
  polarity: string;
}

interface YearGroup {
  id: string;
  name: string;
}

interface ReplayResult {
  rule_name: string;
  stage: string;
  replay_period: { from: string; to: string };
  incidents_evaluated: number;
  incidents_matched: number;
  students_affected: number;
  affected_year_groups: string[];
  actions_that_would_fire: Record<string, number>;
  sample_matches: Array<{
    incident_number: string;
    occurred_at: string;
    student_label: string;
    year_group: string | null;
    category_name: string;
  }>;
}

interface DryRunStageResult {
  stage: string;
  rules_evaluated: number;
  matched_rules: Array<{
    rule_id: string;
    rule_name: string;
    actions_that_would_fire: Array<{ action_type: string }>;
  }>;
}

interface DryRunResult {
  stage_results: DryRunStageResult[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'consequence', label: 'Consequence', icon: AlertTriangle, desc: 'Escalation and sanction creation. Default: first match.' },
  { key: 'approval', label: 'Approval', icon: Shield, desc: 'Approval gating. Default: first match.' },
  { key: 'notification', label: 'Notification', icon: Bell, desc: 'Parent and role notifications. Default: all matching.' },
  { key: 'support', label: 'Support', icon: Heart, desc: 'Interventions, SENCO tasks, pastoral alerts. Default: all matching.' },
  { key: 'alerting', label: 'Alerting', icon: AlertTriangle, desc: 'Flags for review and analytics. Default: all matching.' },
] as const;

const ACTION_TYPES = [
  { value: 'auto_escalate', label: 'Auto-Escalate' },
  { value: 'create_sanction', label: 'Create Sanction' },
  { value: 'require_approval', label: 'Require Approval' },
  { value: 'require_parent_meeting', label: 'Require Parent Meeting' },
  { value: 'require_parent_notification', label: 'Require Parent Notification' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'create_intervention', label: 'Create Intervention' },
  { value: 'notify_roles', label: 'Notify Roles' },
  { value: 'notify_users', label: 'Notify Users' },
  { value: 'flag_for_review', label: 'Flag for Review' },
  { value: 'block_without_approval', label: 'Block Without Approval' },
];

const CONTEXT_TYPES = [
  'class', 'break', 'before_school', 'after_school', 'lunch',
  'transport', 'extra_curricular', 'off_site', 'online', 'other',
];

const PARTICIPANT_ROLES = [
  'subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function conditionSummary(conds: Record<string, unknown>): string {
  const parts: string[] = [];
  if (conds.polarity) parts.push(`${conds.polarity}`);
  if (conds.severity_min || conds.severity_max) {
    parts.push(`sev ${conds.severity_min ?? 1}–${conds.severity_max ?? 10}`);
  }
  if (conds.repeat_count_min) {
    parts.push(`≥${conds.repeat_count_min}× in ${conds.repeat_window_days ?? '?'}d`);
  }
  if ((conds.category_ids as string[] | undefined)?.length) {
    parts.push(`${(conds.category_ids as string[]).length} categories`);
  }
  if (conds.student_has_send) parts.push('SEND');
  return parts.length > 0 ? parts.join(' · ') : 'All incidents (wildcard)';
}

function actionSummary(actions: PolicyAction[]): string {
  return actions
    .map((a) => ACTION_TYPES.find((t) => t.value === a.action_type)?.label ?? a.action_type)
    .join(', ');
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BehaviourPoliciesPage() {
  const [rules, setRules] = React.useState<PolicyRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeStage, setActiveStage] = React.useState('consequence');
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);

  // Editor state
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<PolicyRule | null>(null);
  const [editorForm, setEditorForm] = React.useState(createEmptyForm('consequence'));
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  // Replay state
  const [replayRuleId, setReplayRuleId] = React.useState('');
  const [replayFrom, setReplayFrom] = React.useState('');
  const [replayTo, setReplayTo] = React.useState('');
  const [replayLoading, setReplayLoading] = React.useState(false);
  const [replayResult, setReplayResult] = React.useState<ReplayResult | null>(null);

  // Dry-run state
  const [dryRunOpen, setDryRunOpen] = React.useState(false);
  const [dryRunForm, setDryRunForm] = React.useState(createDryRunForm());
  const [dryRunLoading, setDryRunLoading] = React.useState(false);
  const [dryRunResult, setDryRunResult] = React.useState<DryRunResult | null>(null);

  // Version history state
  const [versionDialogOpen, setVersionDialogOpen] = React.useState(false);
  const [versionHistory, setVersionHistory] = React.useState<Array<Record<string, unknown>>>([]);
  const [versionLoading, setVersionLoading] = React.useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchRules = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: PolicyRule[]; meta: { total: number } }>(
        '/api/v1/behaviour/policies?pageSize=100',
      );
      setRules(res.data ?? []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContext = React.useCallback(async () => {
    try {
      const [catsRes, ygRes] = await Promise.all([
        apiClient<{ data: Category[] }>('/api/v1/behaviour/categories?pageSize=100'),
        apiClient<{ data: YearGroup[] }>('/api/v1/academic/year-groups?pageSize=100'),
      ]);
      setCategories(catsRes.data ?? []);
      setYearGroups(ygRes.data ?? []);
    } catch {
      // Context fetch is best-effort
    }
  }, []);

  React.useEffect(() => {
    void fetchRules();
    void fetchContext();
  }, [fetchRules, fetchContext]);

  const stageRules = React.useMemo(
    () =>
      rules
        .filter((r) => r.stage === activeStage)
        .sort((a, b) => a.priority - b.priority),
    [rules, activeStage],
  );

  // ─── Rule CRUD ──────────────────────────────────────────────────────────

  function createEmptyForm(stage: string) {
    return {
      name: '',
      description: '',
      stage,
      priority: 100,
      match_strategy: 'first_match',
      stop_processing_stage: false,
      is_active: true,
      conditions: {} as Record<string, unknown>,
      actions: [] as PolicyAction[],
      change_reason: '',
    };
  }

  function createDryRunForm() {
    return {
      category_id: '',
      polarity: 'negative' as string,
      severity: 5,
      context_type: 'class',
      student_year_group_id: '',
      student_has_send: false,
      student_has_active_intervention: false,
      participant_role: 'subject',
      repeat_count: 0,
    };
  }

  const openCreate = () => {
    setEditTarget(null);
    setEditorForm(createEmptyForm(activeStage));
    setSaveError('');
    setEditorOpen(true);
  };

  const openEdit = (rule: PolicyRule) => {
    setEditTarget(rule);
    setEditorForm({
      name: rule.name,
      description: rule.description ?? '',
      stage: rule.stage,
      priority: rule.priority,
      match_strategy: rule.match_strategy,
      stop_processing_stage: rule.stop_processing_stage,
      is_active: rule.is_active,
      conditions: { ...rule.conditions },
      actions: rule.actions.map((a) => ({ ...a })),
      change_reason: '',
    });
    setSaveError('');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!editorForm.name.trim()) { setSaveError('Name is required'); return; }
    if (editorForm.actions.length === 0) { setSaveError('At least one action is required'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: editorForm.name.trim(),
        description: editorForm.description.trim() || null,
        stage: editorForm.stage,
        priority: editorForm.priority,
        match_strategy: editorForm.match_strategy,
        stop_processing_stage: editorForm.stop_processing_stage,
        is_active: editorForm.is_active,
        conditions: editorForm.conditions,
        actions: editorForm.actions.map((a, i) => ({
          action_type: a.action_type,
          action_config: a.action_config,
          execution_order: i,
        })),
        ...(editTarget ? { change_reason: editorForm.change_reason || undefined } : {}),
      };
      if (editTarget) {
        await apiClient(`/api/v1/behaviour/policies/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/behaviour/policies', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setEditorOpen(false);
      void fetchRules();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSaveError(ex?.error?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: PolicyRule) => {
    try {
      await apiClient(`/api/v1/behaviour/policies/${rule.id}`, { method: 'DELETE' });
      void fetchRules();
    } catch { /* handled */ }
  };

  const handleToggle = async (rule: PolicyRule) => {
    try {
      await apiClient(`/api/v1/behaviour/policies/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      void fetchRules();
    } catch { /* handled */ }
  };

  const handlePriorityMove = async (rule: PolicyRule, direction: 'up' | 'down') => {
    const idx = stageRules.findIndex((r) => r.id === rule.id);
    const swapWith = direction === 'up' ? stageRules[idx - 1] : stageRules[idx + 1];
    if (!swapWith) return;
    try {
      await Promise.all([
        apiClient(`/api/v1/behaviour/policies/${rule.id}/priority`, {
          method: 'PATCH',
          body: JSON.stringify({ priority: swapWith.priority }),
        }),
        apiClient(`/api/v1/behaviour/policies/${swapWith.id}/priority`, {
          method: 'PATCH',
          body: JSON.stringify({ priority: rule.priority }),
        }),
      ]);
      void fetchRules();
    } catch { /* handled */ }
  };

  // ─── Replay ─────────────────────────────────────────────────────────────

  const handleReplay = async () => {
    if (!replayRuleId || !replayFrom || !replayTo) return;
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const res = await apiClient<ReplayResult>('/api/v1/behaviour/policies/replay', {
        method: 'POST',
        body: JSON.stringify({
          rule_id: replayRuleId,
          replay_period: { from: replayFrom, to: replayTo },
          dry_run: true,
        }),
      });
      setReplayResult(res);
    } catch { /* handled */ }
    finally { setReplayLoading(false); }
  };

  // ─── Dry-Run ────────────────────────────────────────────────────────────

  const handleDryRun = async () => {
    if (!dryRunForm.category_id) return;
    setDryRunLoading(true);
    setDryRunResult(null);
    try {
      const body = {
        ...dryRunForm,
        student_year_group_id: dryRunForm.student_year_group_id || undefined,
      };
      const res = await apiClient<DryRunResult>('/api/v1/behaviour/admin/policy-dry-run', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setDryRunResult(res);
    } catch { /* handled */ }
    finally { setDryRunLoading(false); }
  };

  // ─── Version History ────────────────────────────────────────────────────

  const openVersionHistory = async (ruleId: string) => {
    setVersionDialogOpen(true);
    setVersionLoading(true);
    setVersionHistory([]);
    try {
      const res = await apiClient<{ data: Array<Record<string, unknown>> }>(
        `/api/v1/behaviour/policies/${ruleId}/versions`,
      );
      setVersionHistory(res.data ?? []);
    } catch { /* handled */ }
    finally { setVersionLoading(false); }
  };

  // ─── Export/Import ──────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const data = await apiClient<unknown[]>('/api/v1/behaviour/policies/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'behaviour-policies.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* handled */ }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rulesArray = Array.isArray(parsed) ? parsed : [];
      await apiClient('/api/v1/behaviour/policies/import', {
        method: 'POST',
        body: JSON.stringify({ rules: rulesArray }),
      });
      void fetchRules();
    } catch { /* handled */ }
    event.target.value = '';
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy Rules"
        description="Configure automated responses to behaviour incidents across 5 evaluation stages"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDryRunOpen(true)}>
              <FlaskConical className="me-2 h-4 w-4" />
              Test Mode
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="me-2 h-4 w-4" />
              Export
            </Button>
            <label>
              <Button variant="secondary" size="sm" asChild>
                <span>
                  <Upload className="me-2 h-4 w-4" />
                  Import
                </span>
              </Button>
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <Button onClick={openCreate}>
              <Plus className="me-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>
        }
      />

      {/* Stage Tabs */}
      <div>
        <div className="flex gap-1 overflow-x-auto border-b border-border pb-1">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveStage(s.key)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeStage === s.key
                  ? 'border-b-2 border-emerald-600 text-emerald-700'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
              <Badge variant="secondary" className="ms-1 text-xs">
                {rules.filter((r) => r.stage === s.key).length}
              </Badge>
            </button>
          ))}
        </div>

        {STAGES.filter((s) => s.key === activeStage).map((s) => (
          <div key={s.key} className="mt-4 space-y-4">
            <p className="text-sm text-text-tertiary">{s.desc}</p>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
                ))}
              </div>
            ) : stageRules.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface py-8 text-center text-sm text-text-tertiary">
                No rules configured for this stage.
              </div>
            ) : (
              <div className="space-y-2">
                {stageRules.map((rule, idx) => (
                  <div key={rule.id} className={`rounded-xl border border-border bg-surface px-4 ${!rule.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3 py-3">
                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handlePriorityMove(rule, 'up')}
                          disabled={idx === 0}
                          className="rounded p-0.5 hover:bg-surface-secondary disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handlePriorityMove(rule, 'down')}
                          disabled={idx === stageRules.length - 1}
                          className="rounded p-0.5 hover:bg-surface-secondary disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <GripVertical className="h-4 w-4 text-text-tertiary" />

                      {/* Rule info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{rule.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {rule.match_strategy === 'first_match' ? 'FIRST MATCH' : 'ALL MATCHING'}
                          </Badge>
                          {rule.stop_processing_stage && (
                            <Badge variant="danger" className="text-[10px]">
                              STOPS STAGE
                            </Badge>
                          )}
                          <span className="text-xs text-text-tertiary">P{rule.priority}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
                          <span>{conditionSummary(rule.conditions)}</span>
                          <span>→</span>
                          <span>{actionSummary(rule.actions)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => handleToggle(rule)}
                        />
                        <Button variant="ghost" size="sm" onClick={() => openVersionHistory(rule.id)}>
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-text hover:text-danger-text"
                          onClick={() => handleDelete(rule)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Replay Panel */}
            <div className="mt-6 rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium">Test this stage against past data</h3>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From</Label>
                    <Input
                      type="date"
                      value={replayFrom}
                      onChange={(e) => setReplayFrom(e.target.value)}
                      className="w-40 text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Input
                      type="date"
                      value={replayTo}
                      onChange={(e) => setReplayTo(e.target.value)}
                      className="w-40 text-base"
                    />
                  </div>
                  <div className="min-w-[200px] space-y-1.5">
                    <Label className="text-xs">Rule</Label>
                    <Select value={replayRuleId} onValueChange={setReplayRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a rule" />
                      </SelectTrigger>
                      <SelectContent>
                        {stageRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleReplay} disabled={replayLoading}>
                    <Play className="me-2 h-4 w-4" />
                    {replayLoading ? 'Running...' : 'Run Replay'}
                  </Button>
                </div>

                {replayResult && (
                  <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm">
                    <p className="font-medium">{replayResult.rule_name}</p>
                    <p className="text-text-tertiary">
                      {replayResult.replay_period.from} — {replayResult.replay_period.to}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <span className="text-text-tertiary">Evaluated</span>
                        <p className="text-lg font-semibold">{replayResult.incidents_evaluated}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary">Matched</span>
                        <p className="text-lg font-semibold">{replayResult.incidents_matched}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary">Students</span>
                        <p className="text-lg font-semibold">{replayResult.students_affected}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary">Year Groups</span>
                        <p className="text-lg font-semibold">{replayResult.affected_year_groups.join(', ') || '—'}</p>
                      </div>
                    </div>
                    {Object.keys(replayResult.actions_that_would_fire).length > 0 && (
                      <div className="mt-2">
                        <span className="text-text-tertiary">Actions:</span>
                        <ul className="ms-4 mt-1 list-disc">
                          {Object.entries(replayResult.actions_that_would_fire).map(([action, count]) => (
                            <li key={action}>{action}: {count} times</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Rule Editor Sheet ─────────────────────────────────────────────── */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editTarget ? 'Edit Rule' : 'Add Rule'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={editorForm.name}
                onChange={(e) => setEditorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 3 verbal warnings → written warning"
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editorForm.description}
                onChange={(e) => setEditorForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select
                  value={editorForm.stage}
                  onValueChange={(v) => setEditorForm((f) => ({ ...f, stage: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority (lower = earlier)</Label>
                <Input
                  type="number"
                  value={editorForm.priority}
                  onChange={(e) => setEditorForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 100 }))}
                  className="text-base"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Match Strategy</Label>
                <Select
                  value={editorForm.match_strategy}
                  onValueChange={(v) => setEditorForm((f) => ({ ...f, match_strategy: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_match">First Match</SelectItem>
                    <SelectItem value="all_matching">All Matching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editorForm.stop_processing_stage}
                    onCheckedChange={(v) => setEditorForm((f) => ({ ...f, stop_processing_stage: v }))}
                  />
                  <Label className="text-sm">Stop stage on match</Label>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editorForm.is_active}
                onCheckedChange={(v) => setEditorForm((f) => ({ ...f, is_active: v }))}
              />
              <Label className="text-sm">Enabled</Label>
            </div>

            {/* ─── Conditions ──────────────────────────────────────────── */}
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Conditions</h3>
              <p className="text-xs text-text-tertiary">Leave blank for wildcard. All specified conditions must match (AND).</p>

              <div className="space-y-1.5">
                <Label className="text-xs">Categories</Label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const selected = ((editorForm.conditions.category_ids as string[]) ?? []).includes(cat.id);
                    return (
                      <Button
                        key={cat.id}
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setEditorForm((f) => {
                            const current = (f.conditions.category_ids as string[]) ?? [];
                            const next = selected ? current.filter((id) => id !== cat.id) : [...current, cat.id];
                            return { ...f, conditions: { ...f.conditions, category_ids: next.length > 0 ? next : undefined } };
                          });
                        }}
                      >
                        {cat.name}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Polarity</Label>
                  <Select
                    value={(editorForm.conditions.polarity as string) ?? ''}
                    onValueChange={(v) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, polarity: v || undefined },
                    }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Severity Min</Label>
                  <Input
                    type="number"
                    min={1} max={10}
                    value={(editorForm.conditions.severity_min as number) ?? ''}
                    onChange={(e) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, severity_min: e.target.value ? parseInt(e.target.value, 10) : undefined },
                    }))}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Severity Max</Label>
                  <Input
                    type="number"
                    min={1} max={10}
                    value={(editorForm.conditions.severity_max as number) ?? ''}
                    onChange={(e) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, severity_max: e.target.value ? parseInt(e.target.value, 10) : undefined },
                    }))}
                    className="text-base"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={(editorForm.conditions.student_has_send as boolean) ?? false}
                    onCheckedChange={(v) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, student_has_send: v ? true : undefined },
                    }))}
                  />
                  <Label className="text-xs">Student has SEND</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={(editorForm.conditions.student_has_active_intervention as boolean) ?? false}
                    onCheckedChange={(v) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, student_has_active_intervention: v ? true : undefined },
                    }))}
                  />
                  <Label className="text-xs">Has Active Intervention</Label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Repeat Count Min</Label>
                  <Input
                    type="number"
                    min={1}
                    value={(editorForm.conditions.repeat_count_min as number) ?? ''}
                    onChange={(e) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, repeat_count_min: e.target.value ? parseInt(e.target.value, 10) : undefined },
                    }))}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Window (days)</Label>
                  <Input
                    type="number"
                    min={1} max={365}
                    value={(editorForm.conditions.repeat_window_days as number) ?? ''}
                    onChange={(e) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, repeat_window_days: e.target.value ? parseInt(e.target.value, 10) : undefined },
                    }))}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Participant Role</Label>
                  <Select
                    value={(editorForm.conditions.participant_role as string) ?? ''}
                    onValueChange={(v) => setEditorForm((f) => ({
                      ...f,
                      conditions: { ...f.conditions, participant_role: v || undefined },
                    }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      {PARTICIPANT_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ─── Actions ─────────────────────────────────────────────── */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Actions</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditorForm((f) => ({
                      ...f,
                      actions: [
                        ...f.actions,
                        { action_type: 'create_task', action_config: {}, execution_order: f.actions.length },
                      ],
                    }));
                  }}
                >
                  <Plus className="me-1 h-3 w-3" />
                  Add Action
                </Button>
              </div>
              {editorForm.actions.map((action, idx) => {
                const updateAction = (patch: Partial<PolicyAction>) => {
                  setEditorForm((f) => {
                    const next = [...f.actions];
                    const current = next[idx];
                    if (!current) return f;
                    next[idx] = { ...current, ...patch };
                    return { ...f, actions: next };
                  });
                };
                const updateConfig = (configPatch: Record<string, unknown>) => {
                  setEditorForm((f) => {
                    const next = [...f.actions];
                    const current = next[idx];
                    if (!current) return f;
                    next[idx] = { ...current, action_config: { ...current.action_config, ...configPatch } };
                    return { ...f, actions: next };
                  });
                };
                return (
                <div key={idx} className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Select
                      value={action.action_type}
                      onValueChange={(v) => updateAction({ action_type: v, action_config: {} })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((at) => (
                          <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {action.action_type === 'create_task' && (
                      <Input
                        placeholder="Task title"
                        value={(action.action_config.title as string) ?? ''}
                        onChange={(e) => updateConfig({ title: e.target.value, task_type: 'follow_up' })}
                        className="text-base"
                      />
                    )}
                    {action.action_type === 'auto_escalate' && (
                      <Select
                        value={(action.action_config.target_category_id as string) ?? ''}
                        onValueChange={(v) => updateConfig({ target_category_id: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Target category" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {action.action_type === 'flag_for_review' && (
                      <Input
                        placeholder="Reason"
                        value={(action.action_config.reason as string) ?? ''}
                        onChange={(e) => updateConfig({ reason: e.target.value })}
                        className="text-base"
                      />
                    )}
                    {(action.action_type === 'require_approval' || action.action_type === 'block_without_approval') && (
                      <Input
                        placeholder="Approver role (e.g. deputy_principal)"
                        value={(action.action_config.approver_role as string) ?? ''}
                        onChange={(e) => updateConfig({
                          approver_role: e.target.value,
                          ...(action.action_type === 'block_without_approval' ? { block_reason: 'Blocked by policy' } : {}),
                        })}
                        className="text-base"
                      />
                    )}
                    {action.action_type === 'notify_roles' && (
                      <Input
                        placeholder="Roles (comma-separated, e.g. year_head,deputy_principal)"
                        value={((action.action_config.roles as string[]) ?? []).join(', ')}
                        onChange={(e) => updateConfig({
                          roles: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })}
                        className="text-base"
                      />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-text"
                    onClick={() => {
                      setEditorForm((f) => ({
                        ...f,
                        actions: f.actions.filter((_, i) => i !== idx),
                      }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                );
              })}
            </div>

            {editTarget && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label>Change Reason</Label>
                <Textarea
                  value={editorForm.change_reason}
                  onChange={(e) => setEditorForm((f) => ({ ...f, change_reason: e.target.value }))}
                  placeholder="Why are you making this change?"
                  rows={2}
                />
              </div>
            )}

            {saveError && <p className="text-sm text-danger-text">{saveError}</p>}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editTarget ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Dry-Run Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dryRunOpen} onOpenChange={setDryRunOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Test a Hypothetical Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select
                value={dryRunForm.category_id}
                onValueChange={(v) => setDryRunForm((f) => ({ ...f, category_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Polarity</Label>
                <Select
                  value={dryRunForm.polarity}
                  onValueChange={(v) => setDryRunForm((f) => ({ ...f, polarity: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity (1–10)</Label>
                <Input
                  type="number"
                  min={1} max={10}
                  value={dryRunForm.severity}
                  onChange={(e) => setDryRunForm((f) => ({ ...f, severity: parseInt(e.target.value, 10) || 5 }))}
                  className="text-base"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Context Type</Label>
                <Select
                  value={dryRunForm.context_type}
                  onValueChange={(v) => setDryRunForm((f) => ({ ...f, context_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTEXT_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>{ct.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year Group</Label>
                <Select
                  value={dryRunForm.student_year_group_id}
                  onValueChange={(v) => setDryRunForm((f) => ({ ...f, student_year_group_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {yearGroups.map((yg) => (
                      <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={dryRunForm.student_has_send}
                  onCheckedChange={(v) => setDryRunForm((f) => ({ ...f, student_has_send: !!v }))}
                />
                <Label className="text-sm">Student has SEND</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={dryRunForm.student_has_active_intervention}
                  onCheckedChange={(v) => setDryRunForm((f) => ({ ...f, student_has_active_intervention: !!v }))}
                />
                <Label className="text-sm">Has Active Intervention</Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Past Similar Incidents (repeat count)</Label>
              <Input
                type="number"
                min={0}
                value={dryRunForm.repeat_count}
                onChange={(e) => setDryRunForm((f) => ({ ...f, repeat_count: parseInt(e.target.value, 10) || 0 }))}
                className="text-base"
              />
            </div>

            {dryRunResult && (
              <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm">
                <p className="font-medium">Dry-Run Results</p>
                {dryRunResult.stage_results.map((sr) => (
                  <div key={sr.stage} className="mt-2">
                    <p className="text-xs font-semibold uppercase text-text-tertiary">{sr.stage}</p>
                    <p className="text-text-secondary">{sr.rules_evaluated} rules evaluated</p>
                    {sr.matched_rules.length > 0 ? (
                      <ul className="ms-4 list-disc">
                        {sr.matched_rules.map((mr) => (
                          <li key={mr.rule_id}>
                            <span className="font-medium">{mr.rule_name}</span>
                            {' → '}
                            {mr.actions_that_would_fire.map((a) => a.action_type).join(', ')}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-text-tertiary">No rules matched</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDryRunOpen(false)}>Close</Button>
            <Button onClick={handleDryRun} disabled={dryRunLoading || !dryRunForm.category_id}>
              {dryRunLoading ? 'Testing...' : 'Run Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Version History Dialog ──────────────────────────────────────── */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          {versionLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-surface-secondary" />
              ))}
            </div>
          ) : versionHistory.length === 0 ? (
            <p className="text-sm text-text-tertiary">No version history.</p>
          ) : (
            <div className="space-y-2">
              {versionHistory.map((v) => (
                <div key={v.id as string} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">v{String(v.version)}</span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(String(v.created_at)).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{String(v.name)}</p>
                  {v.change_reason ? (
                    <p className="mt-1 text-xs text-text-tertiary">Reason: {String(v.change_reason)}</p>
                  ) : null}
                  {v.changed_by ? (
                    <p className="text-xs text-text-tertiary">
                      By: {(v.changed_by as Record<string, string>).first_name} {(v.changed_by as Record<string, string>).last_name}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setVersionDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
