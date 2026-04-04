'use client';

import { useTranslations } from 'next-intl';

import {
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
} from '@school/ui';

import type { Category, DryRunFormState, DryRunResult, YearGroup } from './policy-types';
import { CONTEXT_TYPES } from './policy-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DryRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DryRunFormState;
  onFormChange: React.Dispatch<React.SetStateAction<DryRunFormState>>;
  categories: Category[];
  yearGroups: YearGroup[];
  loading: boolean;
  result: DryRunResult | null;
  onRun: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DryRunDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  categories,
  yearGroups,
  loading,
  result,
  onRun,
}: DryRunDialogProps) {
  const t = useTranslations('behaviourSettings.policies');
  const tCommon = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('testAHypotheticalIncident')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('category')}</Label>
            <Select
              value={form.category_id}
              onValueChange={(v) => onFormChange((f) => ({ ...f, category_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('selectCategory')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('polarity')}</Label>
              <Select
                value={form.polarity}
                onValueChange={(v) => onFormChange((f) => ({ ...f, polarity: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">{t('positive')}</SelectItem>
                  <SelectItem value="negative">{t('negative')}</SelectItem>
                  <SelectItem value="neutral">{t('neutral')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('severity1')}{'\u2013'}{t('phonePlaceholder')}</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.severity}
                onChange={(e) =>
                  onFormChange((f) => ({
                    ...f,
                    severity: parseInt(e.target.value, 10) || 5,
                  }))
                }
                className="text-base"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('contextType')}</Label>
              <Select
                value={form.context_type}
                onValueChange={(v) => onFormChange((f) => ({ ...f, context_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {ct.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('yearGroup')}</Label>
              <Select
                value={form.student_year_group_id}
                onValueChange={(v) => onFormChange((f) => ({ ...f, student_year_group_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('any')} />
                </SelectTrigger>
                <SelectContent>
                  {yearGroups.map((yg) => (
                    <SelectItem key={yg.id} value={yg.id}>
                      {yg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={form.student_has_send}
                onCheckedChange={(v) => onFormChange((f) => ({ ...f, student_has_send: !!v }))}
              />
              <Label className="text-sm">{t('studentHasSend')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={form.student_has_active_intervention}
                onCheckedChange={(v) =>
                  onFormChange((f) => ({ ...f, student_has_active_intervention: !!v }))
                }
              />
              <Label className="text-sm">{t('hasActiveIntervention')}</Label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('pastSimilarIncidentsRepeatCount')}</Label>
            <Input
              type="number"
              min={0}
              value={form.repeat_count}
              onChange={(e) =>
                onFormChange((f) => ({
                  ...f,
                  repeat_count: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="text-base"
            />
          </div>

          {result && (
            <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm">
              <p className="font-medium">{t('dryRunResults')}</p>
              {result.stage_results.map((sr) => (
                <div key={sr.stage} className="mt-2">
                  <p className="text-xs font-semibold uppercase text-text-tertiary">{sr.stage}</p>
                  <p className="text-text-secondary">{sr.rules_evaluated}{t('rulesEvaluated')}</p>
                  {sr.matched_rules.length > 0 ? (
                    <ul className="ms-4 list-disc">
                      {sr.matched_rules.map((mr) => (
                        <li key={mr.rule_id}>
                          <span className="font-medium">{mr.rule_name}</span>
                          {' \u2192 '}
                          {mr.actions_that_would_fire.map((a) => a.action_type).join(', ')}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-text-tertiary">{t('noRulesMatched')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{tCommon('close')}</Button>
          <Button onClick={onRun} disabled={loading || !form.category_id}>
            {loading ? 'Testing...' : 'Run Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
