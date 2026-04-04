'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
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
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ClosureFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClosureForm({ open, onOpenChange, onSuccess }: ClosureFormProps) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');

  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [scope, setScope] = React.useState('all');
  const [entityId, setEntityId] = React.useState('');
  const [skipWeekends, setSkipWeekends] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [classes, setClasses] = React.useState<SelectOption[]>([]);

  React.useEffect(() => {
    if (!open) return;
    Promise.all([
      apiClient<{ data: SelectOption[] }>('/api/v1/year-groups?pageSize=100'),
      apiClient<{ data: SelectOption[] }>('/api/v1/classes?pageSize=100'),
    ])
      .then(([ygRes, classRes]) => {
        setYearGroups(ygRes.data);
        setClasses(classRes.data);
      })
      .catch((err) => { console.error('[ClosureForm]', err); });
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setStartDate('');
      setEndDate('');
      setReason('');
      setScope('all');
      setEntityId('');
      setSkipWeekends(true);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !reason.trim()) return;

    setSaving(true);
    try {
      await apiClient('/api/v1/school-closures/bulk', {
        method: 'POST',
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate || startDate,
          reason: reason.trim(),
          scope,
          entity_id: scope !== 'all' ? entityId : null,
          skip_weekends: skipWeekends,
        }),
      });
      toast.success('Closures created');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('[ClosureForm]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const entityOptions = scope === 'year_group' ? yearGroups : scope === 'class' ? classes : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createClosure')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('effectiveFrom')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('effectiveTo')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('reason')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('scope')}</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v);
                setEntityId('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('scopeAll')}</SelectItem>
                <SelectItem value="year_group">{t('scopeYearGroup')}</SelectItem>
                <SelectItem value="class">{t('scopeClass')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope !== 'all' && (
            <div className="space-y-2">
              <Label>{scope === 'year_group' ? t('scopeYearGroup') : t('scopeClass')}</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select')} />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="skip-weekends">{t('skipWeekends')}</Label>
            <Switch id="skip-weekends" checked={skipWeekends} onCheckedChange={setSkipWeekends} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !startDate || !reason.trim()}>
              {saving ? tc('loading') : t('bulkCreate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
