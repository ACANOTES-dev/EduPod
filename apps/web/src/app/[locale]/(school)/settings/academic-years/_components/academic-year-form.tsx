'use client';

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
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


export interface AcademicYearFormValues {
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface AcademicYearFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValues?: Partial<AcademicYearFormValues>;
  onSubmit: (values: AcademicYearFormValues) => Promise<void>;
  title: string;
  submitLabel?: string;
}

const DEFAULT: AcademicYearFormValues = {
  name: '',
  start_date: '',
  end_date: '',
  status: 'planned',
};

export function AcademicYearForm({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  title,
  submitLabel,
}: AcademicYearFormProps) {
  const tc = useTranslations('common');
  const t = useTranslations('academicYears');

  const [values, setValues] = React.useState<AcademicYearFormValues>({ ...DEFAULT, ...initialValues });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setValues({ ...DEFAULT, ...initialValues });
      setError('');
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(values);
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
            <Label htmlFor="ay-name">{t('fieldName')}</Label>
            <Input
              id="ay-name"
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ay-start">{t('fieldStartDate')}</Label>
              <Input
                id="ay-start"
                type="date"
                value={values.start_date}
                onChange={(e) => setValues((p) => ({ ...p, start_date: e.target.value }))}
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ay-end">{t('fieldEndDate')}</Label>
              <Input
                id="ay-end"
                type="date"
                value={values.end_date}
                onChange={(e) => setValues((p) => ({ ...p, end_date: e.target.value }))}
                required
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ay-status">{t('fieldStatus')}</Label>
            <Select value={values.status} onValueChange={(v) => setValues((p) => ({ ...p, status: v }))}>
              <SelectTrigger id="ay-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">{t('statusPlanned')}</SelectItem>
                <SelectItem value="active">{t('statusActive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? tc('loading') : (submitLabel ?? tc('save'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
