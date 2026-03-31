'use client';

import { Button } from '@school/ui';
import { Download, FlaskConical, Plus, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DryRunDialog } from './_components/dry-run-dialog';
import type {
  Category,
  DryRunResult,
  EditorFormState,
  PolicyRule,
  ReplayResult,
  YearGroup,
} from './_components/policy-types';
import { createDryRunForm, createEmptyForm } from './_components/policy-types';
import { ReplayPanel } from './_components/replay-panel';
import { RuleEditorSheet } from './_components/rule-editor-sheet';
import { StageRulesList, StageTabs } from './_components/stage-rules-list';
import { VersionHistoryDialog } from './_components/version-history-dialog';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourPoliciesPage() {
  const t = useTranslations('behaviourSettings.policies');
  const [rules, setRules] = React.useState<PolicyRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeStage, setActiveStage] = React.useState('consequence');
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);

  // Editor state
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<PolicyRule | null>(null);
  const [editorForm, setEditorForm] = React.useState<EditorFormState>(
    createEmptyForm('consequence'),
  );
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
    () => rules.filter((r) => r.stage === activeStage).sort((a, b) => a.priority - b.priority),
    [rules, activeStage],
  );

  // ─── Rule CRUD ──────────────────────────────────────────────────────────

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
    if (!editorForm.name.trim()) {
      setSaveError('Name is required');
      return;
    }
    if (editorForm.actions.length === 0) {
      setSaveError('At least one action is required');
      return;
    }
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
    } catch {
      /* handled */
    }
  };

  const handleToggle = async (rule: PolicyRule) => {
    try {
      await apiClient(`/api/v1/behaviour/policies/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      void fetchRules();
    } catch {
      /* handled */
    }
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
    } catch {
      /* handled */
    }
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
    } catch {
      /* handled */
    } finally {
      setReplayLoading(false);
    }
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
    } catch {
      /* handled */
    } finally {
      setDryRunLoading(false);
    }
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
    } catch {
      /* handled */
    } finally {
      setVersionLoading(false);
    }
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
    } catch {
      /* handled */
    }
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
    } catch {
      /* handled */
    }
    event.target.value = '';
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDryRunOpen(true)}>
              <FlaskConical className="me-2 h-4 w-4" />
              {t('testMode')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
              <Download className="me-2 h-4 w-4" />
              {t('export')}
            </Button>
            <label>
              <Button variant="secondary" size="sm" asChild>
                <span>
                  <Upload className="me-2 h-4 w-4" />
                  {t('import')}
                </span>
              </Button>
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <Button onClick={openCreate}>
              <Plus className="me-2 h-4 w-4" />
              {t('addRule')}
            </Button>
          </div>
        }
      />

      {/* Stage Tabs */}
      <div>
        <StageTabs activeStage={activeStage} onStageChange={setActiveStage} rules={rules} />

        <StageRulesList
          activeStage={activeStage}
          stageRules={stageRules}
          loading={loading}
          onToggle={(rule) => void handleToggle(rule)}
          onEdit={openEdit}
          onDelete={(rule) => void handleDelete(rule)}
          onPriorityMove={(rule, dir) => void handlePriorityMove(rule, dir)}
          onViewHistory={(ruleId) => void openVersionHistory(ruleId)}
        />

        <ReplayPanel
          stageRules={stageRules}
          replayRuleId={replayRuleId}
          onReplayRuleIdChange={setReplayRuleId}
          replayFrom={replayFrom}
          onReplayFromChange={setReplayFrom}
          replayTo={replayTo}
          onReplayToChange={setReplayTo}
          replayLoading={replayLoading}
          replayResult={replayResult}
          onReplay={() => void handleReplay()}
        />
      </div>

      {/* Rule Editor Sheet */}
      <RuleEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editTarget={editTarget}
        form={editorForm}
        onFormChange={setEditorForm}
        categories={categories}
        saving={saving}
        saveError={saveError}
        onSave={() => void handleSave()}
      />

      {/* Dry-Run Dialog */}
      <DryRunDialog
        open={dryRunOpen}
        onOpenChange={setDryRunOpen}
        form={dryRunForm}
        onFormChange={setDryRunForm}
        categories={categories}
        yearGroups={yearGroups}
        loading={dryRunLoading}
        result={dryRunResult}
        onRun={() => void handleDryRun()}
      />

      {/* Version History Dialog */}
      <VersionHistoryDialog
        open={versionDialogOpen}
        onOpenChange={setVersionDialogOpen}
        loading={versionLoading}
        history={versionHistory}
      />
    </div>
  );
}
