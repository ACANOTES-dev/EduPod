'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface AcademicYear {
  id: string;
  name: string;
}

interface CreatedPlan {
  id: string;
}

interface CreatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (plan: CreatedPlan) => void;
  profileId: string;
}

export function CreatePlanDialog({
  open,
  onOpenChange,
  onCreated,
  profileId,
}: CreatePlanDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);
  const [academicYearId, setAcademicYearId] = React.useState('');
  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [yearsLoading, setYearsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAcademicYearId('');
    setYearsLoading(true);
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100')
      .then((res) => {
        setYears(res.data);
        if (res.data.length > 0) {
          setAcademicYearId(res.data[0]!.id);
        }
      })
      .catch((err) => {
        console.error('[CreatePlanDialog] fetchYears', err);
      })
      .finally(() => setYearsLoading(false));
  }, [open]);

  const handleSave = React.useCallback(async () => {
    if (!academicYearId) return;
    setSaving(true);
    try {
      const res = await apiClient<{ data: CreatedPlan }>(
        `/api/v1/sen/profiles/${profileId}/plans`,
        {
          method: 'POST',
          body: JSON.stringify({ academic_year_id: academicYearId }),
        },
      );
      toast.success(t('createPlan.success'));
      onOpenChange(false);
      onCreated(res.data);
    } catch (err) {
      console.error('[CreatePlanDialog] save', err);
      toast.error(t('createPlan.error'));
    } finally {
      setSaving(false);
    }
  }, [academicYearId, profileId, onOpenChange, onCreated, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createPlan.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('createPlan.academicYear')}</Label>
            <Select
              value={academicYearId}
              onValueChange={setAcademicYearId}
              disabled={yearsLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('createPlan.selectAcademicYear')} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('createPlan.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !academicYearId}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('createPlan.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
