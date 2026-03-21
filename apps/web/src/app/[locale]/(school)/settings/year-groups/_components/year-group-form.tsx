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


interface YearGroup {
  id: string;
  name: string;
}

export interface YearGroupFormValues {
  name: string;
  display_order: number;
  next_year_group_id: string;
}

interface YearGroupFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValues?: Partial<YearGroupFormValues>;
  onSubmit: (values: YearGroupFormValues) => Promise<void>;
  title: string;
  submitLabel?: string;
  existingGroups?: YearGroup[];
  excludeId?: string;
}

const DEFAULT: YearGroupFormValues = {
  name: '',
  display_order: 1,
  next_year_group_id: '',
};

export function YearGroupForm({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  title,
  submitLabel,
  existingGroups = [],
  excludeId,
}: YearGroupFormProps) {
  const tc = useTranslations('common');
  const t = useTranslations('yearGroups');

  const [values, setValues] = React.useState<YearGroupFormValues>({ ...DEFAULT, ...initialValues });
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

  const availableGroups = existingGroups.filter((g) => g.id !== excludeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="yg-name">{t('fieldName')}</Label>
            <Input
              id="yg-name"
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yg-order">{t('fieldDisplayOrder')}</Label>
            <Input
              id="yg-order"
              type="number"
              min={1}
              value={values.display_order}
              onChange={(e) => setValues((p) => ({ ...p, display_order: parseInt(e.target.value, 10) || 1 }))}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="yg-next">{t('fieldNextYearGroup')}</Label>
            <Select
              value={values.next_year_group_id || '__none__'}
              onValueChange={(v) => setValues((p) => ({ ...p, next_year_group_id: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger id="yg-next">
                <SelectValue placeholder={t('noNextGroup')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('noNextGroup')}</SelectItem>
                {availableGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
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
