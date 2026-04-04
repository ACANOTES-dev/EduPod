'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Button,
  Checkbox,
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

import type { Category, EditorFormState, PolicyAction, PolicyRule } from './policy-types';
import { ACTION_TYPES, PARTICIPANT_ROLES, STAGES } from './policy-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RuleEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: PolicyRule | null;
  form: EditorFormState;
  onFormChange: React.Dispatch<React.SetStateAction<EditorFormState>>;
  categories: Category[];
  saving: boolean;
  saveError: string;
  onSave: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleEditorSheet({
  open,
  onOpenChange,
  editTarget,
  form,
  onFormChange,
  categories,
  saving,
  saveError,
  onSave,
}: RuleEditorSheetProps) {
  const t = useTranslations('behaviourSettings.policies');
  const tCommon = useTranslations('common');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{editTarget ? 'Edit Rule' : 'Add Rule'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('name')}</Label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('eG3VerbalWarnings')}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('description2')}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => onFormChange((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('stage')}</Label>
              <Select
                value={form.stage}
                onValueChange={(v) => onFormChange((f) => ({ ...f, stage: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('priorityLowerEarlier')}</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 100 }))
                }
                className="text-base"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('matchStrategy')}</Label>
              <Select
                value={form.match_strategy}
                onValueChange={(v) => onFormChange((f) => ({ ...f, match_strategy: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_match">{t('firstMatch')}</SelectItem>
                  <SelectItem value="all_matching">{t('allMatching')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.stop_processing_stage}
                  onCheckedChange={(v) => onFormChange((f) => ({ ...f, stop_processing_stage: v }))}
                />
                <Label className="text-sm">{t('stopStageOnMatch')}</Label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => onFormChange((f) => ({ ...f, is_active: v }))}
            />
            <Label className="text-sm">{t('enabled')}</Label>
          </div>

          {/* ─── Conditions ──────────────────────────────────────────── */}
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t('conditions')}</h3>
            <p className="text-xs text-text-tertiary">{t('leaveBlankForWildcardAll')}</p>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('categories')}</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = ((form.conditions.category_ids as string[]) ?? []).includes(
                    cat.id,
                  );
                  return (
                    <Button
                      key={cat.id}
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        onFormChange((f) => {
                          const current = (f.conditions.category_ids as string[]) ?? [];
                          const next = selected
                            ? current.filter((id) => id !== cat.id)
                            : [...current, cat.id];
                          return {
                            ...f,
                            conditions: {
                              ...f.conditions,
                              category_ids: next.length > 0 ? next : undefined,
                            },
                          };
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
                <Label className="text-xs">{t('polarity')}</Label>
                <Select
                  value={(form.conditions.polarity as string) ?? ''}
                  onValueChange={(v) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: { ...f.conditions, polarity: v || undefined },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('any')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">{t('positive')}</SelectItem>
                    <SelectItem value="negative">{t('negative')}</SelectItem>
                    <SelectItem value="neutral">{t('neutral')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('severityMin')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={(form.conditions.severity_min as number) ?? ''}
                  onChange={(e) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: {
                        ...f.conditions,
                        severity_min: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    }))
                  }
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('severityMax')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={(form.conditions.severity_max as number) ?? ''}
                  onChange={(e) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: {
                        ...f.conditions,
                        severity_max: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    }))
                  }
                  className="text-base"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={(form.conditions.student_has_send as boolean) ?? false}
                  onCheckedChange={(v) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: { ...f.conditions, student_has_send: v ? true : undefined },
                    }))
                  }
                />
                <Label className="text-xs">{t('studentHasSend')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={(form.conditions.student_has_active_intervention as boolean) ?? false}
                  onCheckedChange={(v) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: {
                        ...f.conditions,
                        student_has_active_intervention: v ? true : undefined,
                      },
                    }))
                  }
                />
                <Label className="text-xs">{t('hasActiveIntervention')}</Label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('repeatCountMin')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={(form.conditions.repeat_count_min as number) ?? ''}
                  onChange={(e) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: {
                        ...f.conditions,
                        repeat_count_min: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    }))
                  }
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('windowDays')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={(form.conditions.repeat_window_days as number) ?? ''}
                  onChange={(e) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: {
                        ...f.conditions,
                        repeat_window_days: e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      },
                    }))
                  }
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('participantRole')}</Label>
                <Select
                  value={(form.conditions.participant_role as string) ?? ''}
                  onValueChange={(v) =>
                    onFormChange((f) => ({
                      ...f,
                      conditions: { ...f.conditions, participant_role: v || undefined },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('any')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTICIPANT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ─── Actions ─────────────────────────────────────────────── */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{tCommon('actions')}</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onFormChange((f) => ({
                    ...f,
                    actions: [
                      ...f.actions,
                      {
                        action_type: 'create_task',
                        action_config: {},
                        execution_order: f.actions.length,
                      },
                    ],
                  }));
                }}
              >
                <Plus className="me-1 h-3 w-3" />{t('addAction')}</Button>
            </div>
            {form.actions.map((action, idx) => {
              const updateAction = (patch: Partial<PolicyAction>) => {
                onFormChange((f) => {
                  const next = [...f.actions];
                  const current = next[idx];
                  if (!current) return f;
                  next[idx] = { ...current, ...patch };
                  return { ...f, actions: next };
                });
              };
              const updateConfig = (configPatch: Record<string, unknown>) => {
                onFormChange((f) => {
                  const next = [...f.actions];
                  const current = next[idx];
                  if (!current) return f;
                  next[idx] = {
                    ...current,
                    action_config: { ...current.action_config, ...configPatch },
                  };
                  return { ...f, actions: next };
                });
              };
              return (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Select
                      value={action.action_type}
                      onValueChange={(v) => updateAction({ action_type: v, action_config: {} })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((at) => (
                          <SelectItem key={at.value} value={at.value}>
                            {at.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {action.action_type === 'create_task' && (
                      <Input
                        placeholder={t('taskTitle')}
                        value={(action.action_config.title as string) ?? ''}
                        onChange={(e) =>
                          updateConfig({ title: e.target.value, task_type: 'follow_up' })
                        }
                        className="text-base"
                      />
                    )}
                    {action.action_type === 'auto_escalate' && (
                      <Select
                        value={(action.action_config.target_category_id as string) ?? ''}
                        onValueChange={(v) => updateConfig({ target_category_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('targetCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {action.action_type === 'flag_for_review' && (
                      <Input
                        placeholder={t('reason')}
                        value={(action.action_config.reason as string) ?? ''}
                        onChange={(e) => updateConfig({ reason: e.target.value })}
                        className="text-base"
                      />
                    )}
                    {(action.action_type === 'require_approval' ||
                      action.action_type === 'block_without_approval') && (
                      <Input
                        placeholder={t('approverRoleEGDeputy')}
                        value={(action.action_config.approver_role as string) ?? ''}
                        onChange={(e) =>
                          updateConfig({
                            approver_role: e.target.value,
                            ...(action.action_type === 'block_without_approval'
                              ? { block_reason: 'Blocked by policy' }
                              : {}),
                          })
                        }
                        className="text-base"
                      />
                    )}
                    {action.action_type === 'notify_roles' && (
                      <Input
                        placeholder={t('rolesCommaSeparatedEG')}
                        value={((action.action_config.roles as string[]) ?? []).join(', ')}
                        onChange={(e) =>
                          updateConfig({
                            roles: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="text-base"
                      />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-text"
                    onClick={() => {
                      onFormChange((f) => ({
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
              <Label>{t('changeReason')}</Label>
              <Textarea
                value={form.change_reason}
                onChange={(e) => onFormChange((f) => ({ ...f, change_reason: e.target.value }))}
                placeholder={t('whyAreYouMakingThis')}
                rows={2}
              />
            </div>
          )}

          {saveError && <p className="text-sm text-danger-text">{saveError}</p>}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>{tCommon('cancel')}</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving...' : editTarget ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
