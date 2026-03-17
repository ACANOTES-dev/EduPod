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
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { apiClient } from '@/lib/api-client';

interface StaffOption {
  id: string;
  full_name: string;
}

interface CompensationRecord {
  id: string;
  staff_profile_id: string;
  compensation_type: 'salaried' | 'per_class';
  base_salary: number | null;
  per_class_rate: number | null;
  assigned_classes: number | null;
  bonus_class_rate: number | null;
  bonus_day_multiplier: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface CompensationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: CompensationRecord | null;
  onSuccess: () => void;
}

export function CompensationForm({ open, onOpenChange, record, onSuccess }: CompensationFormProps) {
  const t = useTranslations('payroll');
  const isEdit = !!record;

  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [staffProfileId, setStaffProfileId] = React.useState('');
  const [compensationType, setCompensationType] = React.useState<'salaried' | 'per_class'>('salaried');
  const [baseSalary, setBaseSalary] = React.useState('');
  const [perClassRate, setPerClassRate] = React.useState('');
  const [assignedClasses, setAssignedClasses] = React.useState('');
  const [bonusClassRate, setBonusClassRate] = React.useState('');
  const [bonusDayMultiplier, setBonusDayMultiplier] = React.useState('');
  const [effectiveFrom, setEffectiveFrom] = React.useState('');
  const [effectiveTo, setEffectiveTo] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      void apiClient<{ data: StaffOption[] }>('/api/v1/staff-profiles?pageSize=200&fields=id,full_name')
        .then((res) => setStaffOptions(res.data))
        .catch(() => {});
    }
  }, [open]);

  React.useEffect(() => {
    if (record) {
      setStaffProfileId(record.staff_profile_id);
      setCompensationType(record.compensation_type);
      setBaseSalary(record.base_salary != null ? String(record.base_salary) : '');
      setPerClassRate(record.per_class_rate != null ? String(record.per_class_rate) : '');
      setAssignedClasses(record.assigned_classes != null ? String(record.assigned_classes) : '');
      setBonusClassRate(record.bonus_class_rate != null ? String(record.bonus_class_rate) : '');
      setBonusDayMultiplier(record.bonus_day_multiplier != null ? String(record.bonus_day_multiplier) : '');
      setEffectiveFrom(record.effective_from.slice(0, 10));
      setEffectiveTo(record.effective_to ? record.effective_to.slice(0, 10) : '');
    } else {
      setStaffProfileId('');
      setCompensationType('salaried');
      setBaseSalary('');
      setPerClassRate('');
      setAssignedClasses('');
      setBonusClassRate('');
      setBonusDayMultiplier('');
      setEffectiveFrom('');
      setEffectiveTo('');
    }
  }, [record, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        staff_profile_id: staffProfileId,
        compensation_type: compensationType,
        effective_from: effectiveFrom,
      };
      if (effectiveTo) body.effective_to = effectiveTo;

      if (compensationType === 'salaried') {
        body.base_salary = Number(baseSalary);
        if (bonusDayMultiplier) body.bonus_day_multiplier = Number(bonusDayMultiplier);
      } else {
        body.per_class_rate = Number(perClassRate);
        if (assignedClasses) body.assigned_classes = Number(assignedClasses);
        if (bonusClassRate) body.bonus_class_rate = Number(bonusClassRate);
      }

      if (isEdit) {
        await apiClient(`/api/v1/payroll/compensation/${record.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/payroll/compensation', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSuccess();
    } catch {
      // handled by apiClient
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editCompensation') : t('addCompensation')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Staff selector */}
          <div className="space-y-2">
            <Label>{t('selectStaff')}</Label>
            <Select value={staffProfileId} onValueChange={setStaffProfileId} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectStaff')} />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Compensation type */}
          <div className="space-y-2">
            <Label>{t('compensationType')}</Label>
            <RadioGroup
              value={compensationType}
              onValueChange={(v) => setCompensationType(v as 'salaried' | 'per_class')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="salaried" id="type-salaried" />
                <Label htmlFor="type-salaried">{t('salaried')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="per_class" id="type-per-class" />
                <Label htmlFor="type-per-class">{t('perClass')}</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Conditional fields */}
          {compensationType === 'salaried' ? (
            <>
              <div className="space-y-2">
                <Label>{t('baseSalary')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('bonusDayMultiplier')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonusDayMultiplier}
                  onChange={(e) => setBonusDayMultiplier(e.target.value)}
                  placeholder="e.g. 1.5"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t('perClassRate')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={perClassRate}
                  onChange={(e) => setPerClassRate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('assignedClasses')}</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={assignedClasses}
                  onChange={(e) => setAssignedClasses(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('bonusClassRate')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonusClassRate}
                  onChange={(e) => setBonusClassRate(e.target.value)}
                  placeholder="Rate for extra classes"
                />
              </div>
            </>
          )}

          {/* Effective dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('effectiveFrom')}</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('effectiveTo')}</Label>
              <Input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !staffProfileId}>
              {isSaving ? '...' : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
