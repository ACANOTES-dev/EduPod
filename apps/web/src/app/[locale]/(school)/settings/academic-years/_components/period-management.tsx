'use client';

import { Plus, Pencil } from 'lucide-react';
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
  StatusBadge,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  name: string;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface PeriodManagementProps {
  academicYearId: string;
}

interface PeriodFormValues {
  name: string;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

const DEFAULT_PERIOD: PeriodFormValues = {
  name: '',
  period_type: 'term',
  start_date: '',
  end_date: '',
  status: 'planned',
};

// ─── Period Dialog ────────────────────────────────────────────────────────────

interface PeriodDialogProps {
  academicYearId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  initialValues?: Partial<PeriodFormValues>;
  editId?: string;
  title: string;
}

function PeriodDialog({
  academicYearId,
  open,
  onOpenChange,
  onSuccess,
  initialValues,
  editId,
  title,
}: PeriodDialogProps) {
  const t = useTranslations('academicYears');
  const tc = useTranslations('common');

  const [values, setValues] = React.useState<PeriodFormValues>({
    ...DEFAULT_PERIOD,
    ...initialValues,
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setValues({ ...DEFAULT_PERIOD, ...initialValues });
      setError('');
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (editId) {
        await apiClient(`/api/v1/academic-years/${academicYearId}/periods/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });
      } else {
        await apiClient(`/api/v1/academic-years/${academicYearId}/periods`, {
          method: 'POST',
          body: JSON.stringify({ ...values, academic_year_id: academicYearId }),
        });
      }
      onSuccess();
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
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fieldName')}</Label>
            <Input
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fieldPeriodType')}</Label>
            <Select
              value={values.period_type}
              onValueChange={(v) => setValues((p) => ({ ...p, period_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="term">{t('typeTerm')}</SelectItem>
                <SelectItem value="semester">{t('typeSemester')}</SelectItem>
                <SelectItem value="quarter">{t('typeQuarter')}</SelectItem>
                <SelectItem value="custom">{t('typeCustom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('fieldStartDate')}</Label>
              <Input
                type="date"
                value={values.start_date}
                onChange={(e) => setValues((p) => ({ ...p, start_date: e.target.value }))}
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('fieldEndDate')}</Label>
              <Input
                type="date"
                value={values.end_date}
                onChange={(e) => setValues((p) => ({ ...p, end_date: e.target.value }))}
                required
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fieldStatus')}</Label>
            <Select
              value={values.status}
              onValueChange={(v) => setValues((p) => ({ ...p, status: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">{t('statusPlanned')}</SelectItem>
                <SelectItem value="active">{t('statusActive')}</SelectItem>
                <SelectItem value="closed">{t('statusClosed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PeriodManagement({ academicYearId }: PeriodManagementProps) {
  const t = useTranslations('academicYears');

  const [periods, setPeriods] = React.useState<Period[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Period | null>(null);

  const fetchPeriods = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: Period[] }>(
        `/api/v1/academic-years/${academicYearId}/periods`,
      );
      setPeriods(res.data);
    } catch {
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [academicYearId]);

  React.useEffect(() => {
    void fetchPeriods();
  }, [fetchPeriods]);

  const statusBadge = (status: string) => {
    if (status === 'active')
      return (
        <StatusBadge status="success" dot>
          {t('statusActive')}
        </StatusBadge>
      );
    if (status === 'planned')
      return (
        <StatusBadge status="info" dot>
          {t('statusPlanned')}
        </StatusBadge>
      );
    return (
      <StatusBadge status="neutral" dot>
        {t('statusClosed')}
      </StatusBadge>
    );
  };

  if (loading) {
    return <div className="h-16 animate-pulse rounded-lg bg-surface-secondary" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-primary">{t('periodsTitle')}</h4>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="me-1.5 h-3.5 w-3.5" />
          {t('addPeriod')}
        </Button>
      </div>

      {periods.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noPeriods')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {periods.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                  <p className="text-xs text-text-tertiary" dir="ltr">
                    {formatDate(p.start_date)} – {formatDate(p.end_date)}
                  </p>
                </div>
                {statusBadge(p.status)}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditTarget(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PeriodDialog
        academicYearId={academicYearId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={fetchPeriods}
        title={t('addPeriod')}
      />
      {editTarget && (
        <PeriodDialog
          academicYearId={academicYearId}
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          onSuccess={fetchPeriods}
          editId={editTarget.id}
          initialValues={{
            name: editTarget.name,
            period_type: editTarget.period_type,
            start_date: editTarget.start_date.slice(0, 10),
            end_date: editTarget.end_date.slice(0, 10),
            status: editTarget.status,
          }}
          title={t('editPeriod')}
        />
      )}
    </div>
  );
}
