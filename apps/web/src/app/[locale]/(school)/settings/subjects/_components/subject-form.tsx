'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

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

export interface SubjectFormValues {
  name: string;
  code: string;
  subject_type: string;
  active: boolean;
}

interface SubjectFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValues?: Partial<SubjectFormValues>;
  onSubmit: (values: SubjectFormValues) => Promise<void>;
  title: string;
  submitLabel?: string;
}

const DEFAULT: SubjectFormValues = {
  name: '',
  code: '',
  subject_type: 'academic',
  active: true,
};

export function SubjectForm({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  title,
  submitLabel,
}: SubjectFormProps) {
  const tc = useTranslations('common');
  const t = useTranslations('subjects');

  const [values, setValues] = React.useState<SubjectFormValues>({ ...DEFAULT, ...initialValues });
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
            <Label htmlFor="sub-name">{t('fieldName')}</Label>
            <Input
              id="sub-name"
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-code">{t('fieldCode')}</Label>
            <Input
              id="sub-code"
              value={values.code}
              onChange={(e) => setValues((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              dir="ltr"
              placeholder="e.g. MATH"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-type">{t('fieldType')}</Label>
            <Select
              value={values.subject_type}
              onValueChange={(v) => setValues((p) => ({ ...p, subject_type: v }))}
            >
              <SelectTrigger id="sub-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="academic">{t('typeAcademic')}</SelectItem>
                <SelectItem value="supervision">{t('typeSupervision')}</SelectItem>
                <SelectItem value="duty">{t('typeDuty')}</SelectItem>
                <SelectItem value="other">{t('typeOther')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sub-active"
              checked={values.active}
              onCheckedChange={(checked) =>
                setValues((p) => ({ ...p, active: checked === true }))
              }
            />
            <Label htmlFor="sub-active">{t('fieldActive')}</Label>
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
