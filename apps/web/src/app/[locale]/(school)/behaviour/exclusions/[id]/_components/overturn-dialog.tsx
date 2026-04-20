'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { type OverturnExclusionDto, overturnExclusionSchema } from '@school/shared/behaviour';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@school/ui';

interface OverturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  actionError: string;
  onSubmit: (dto: OverturnExclusionDto) => void;
}

export function OverturnDialog({
  open,
  onOpenChange,
  submitting,
  actionError,
  onSubmit,
}: OverturnDialogProps) {
  const t = useTranslations('behaviour.exclusionDetail');
  const tCommon = useTranslations('common');

  const form = useForm<OverturnExclusionDto>({
    resolver: zodResolver(overturnExclusionSchema),
    defaultValues: { reason: '' },
    mode: 'onChange',
  });

  function handleClose(next: boolean) {
    if (!next) form.reset({ reason: '' });
    onOpenChange(next);
  }

  function handleSubmit(values: OverturnExclusionDto) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('overturnCase')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void form.handleSubmit(handleSubmit)(e)}>
          <div className="space-y-4 py-2">
            <p className="text-sm text-text-secondary">{t('overturnDescription')}</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">{t('overturnReason')}</label>
              <Textarea
                rows={4}
                placeholder={t('overturnReasonPlaceholder')}
                {...form.register('reason')}
              />
              {form.formState.errors.reason && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {form.formState.errors.reason.message}
                </p>
              )}
            </div>
            {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={submitting || !form.formState.isValid}
            >
              {submitting ? t('overturning') : t('confirmOverturn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
