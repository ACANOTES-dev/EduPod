'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@school/ui';

const saveDialogSchema = z.object({
  name: z.string().min(2, { message: 'tooShort' }).max(80, { message: 'tooLong' })
    .transform((s) => s.trim())
    .refine((s) => s.length >= 2, { message: 'tooShort' }),
  description: z.string().max(500).optional().or(z.literal('')),
  visibility: z.enum(['private', 'shared']),
  is_favorite: z.boolean(),
});

export type SaveDialogValues = z.infer<typeof saveDialogSchema>;

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<SaveDialogValues>;
  onSave: (values: SaveDialogValues) => Promise<null | 'NAME_TAKEN' | 'GENERIC'>;
}

export function SaveDialog({ open, onOpenChange, initial, onSave }: SaveDialogProps) {
  const t = useTranslations('reports.builder.saveDialog');
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const form = useForm<SaveDialogValues>({
    resolver: zodResolver(saveDialogSchema),
    defaultValues: {
      name: initial.name ?? '',
      description: initial.description ?? '',
      visibility: initial.visibility ?? 'private',
      is_favorite: initial.is_favorite ?? false,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: initial.name ?? '',
        description: initial.description ?? '',
        visibility: initial.visibility ?? 'private',
        is_favorite: initial.is_favorite ?? false,
      });
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await onSave(values);
    if (result === null) { onOpenChange(false); return; }
    if (result === 'NAME_TAKEN') { setSubmitError(t('errors.nameTaken')); return; }
    setSubmitError(t('errors.saveFailed'));
  });

  const nameError = form.formState.errors.name;
  const isFavorite = form.watch('is_favorite');
  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" data-testid="save-dialog-form">
          <div className="space-y-1.5">
            <label htmlFor="report-name" className="text-sm font-medium text-text-primary">
              {t('fields.name')} <span className="text-red-500">*</span>
            </label>
            <input id="report-name" type="text" {...form.register('name')} placeholder={t('fields.namePlaceholder')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus data-testid="save-name-input" />
            {nameError && (
              <p className="text-xs text-red-600">
                {nameError.message === 'tooShort' || nameError.message === 'tooLong' ? t('errors.invalidName') : nameError.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="report-description" className="text-sm font-medium text-text-primary">{t('fields.description')}</label>
            <textarea id="report-description" {...form.register('description')} placeholder={t('fields.descriptionPlaceholder')} rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-text-primary">{t('fields.visibility')}</span>
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" value="private" {...form.register('visibility')} className="mt-0.5 h-4 w-4" />
                <span className="text-sm text-text-secondary">{t('fields.private')}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" value="shared" {...form.register('visibility')} className="mt-0.5 h-4 w-4" />
                <span className="text-sm text-text-secondary">{t('fields.shared')}</span>
              </label>
            </div>
            <p className="text-xs text-text-tertiary">{t('fields.visibilityHint')}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" {...form.register('is_favorite')} className="h-4 w-4" />
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-500' : 'text-text-tertiary'}`} />
            <span className="text-sm text-text-secondary">{t('fields.favorite')}</span>
          </label>
          {submitError && (<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{submitError}</p>)}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { saveDialogSchema };
