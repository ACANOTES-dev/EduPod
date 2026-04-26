'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { publishSnapshotSchema, type PublishSnapshotDto } from '@school/shared/budgeting';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { SnapshotDetail } from './snapshot-types';

interface Props {
  open: boolean;
  modelId: string;
  modelName: string;
  onClose: () => void;
  onPublished: (snapshotId: string, versionNumber: number) => void;
}

const MAX_LENGTH = 20_000;

interface ApiError {
  error?: { code?: string; message?: string };
  status?: number;
}

export function PublishModal({ open, modelId, modelName, onClose, onPublished }: Props) {
  const t = useTranslations('financeBudgetingSnapshots.publishModal');

  const form = useForm<PublishSnapshotDto>({
    resolver: zodResolver(publishSnapshotSchema),
    defaultValues: { executive_summary: '' },
  });

  const [confirmed, setConfirmed] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!open) {
      form.reset({ executive_summary: '' });
      setConfirmed(false);
    }
  }, [open, form]);

  const summary = form.watch('executive_summary') ?? '';
  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: PublishSnapshotDto): Promise<void> => {
    try {
      const res = await apiClient<SnapshotDetail>(
        `/api/v1/budgeting/financial-models/${modelId}/snapshots/publish`,
        {
          method: 'POST',
          body: JSON.stringify({ executive_summary: values.executive_summary }),
          silent: true,
        },
      );
      onPublished(res.id, res.version_number);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      const code = apiErr?.error?.code;
      console.error('[PublishModal.submit]', err);
      if (code === 'NO_CHANGES_TO_PUBLISH') {
        toast.error(t('noChangesError'));
      } else {
        toast.error(apiErr?.error?.message ?? t('genericError'));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body', { modelName })}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-executive-summary">{t('executiveSummaryLabel')}</Label>
            <Textarea
              id="publish-executive-summary"
              rows={6}
              placeholder={t('executiveSummaryPlaceholder')}
              maxLength={MAX_LENGTH}
              {...form.register('executive_summary')}
            />
            <p className="text-xs text-text-tertiary">
              {t('characterCount', { count: summary.length, max: MAX_LENGTH })}
            </p>
            {form.formState.errors.executive_summary?.message && (
              <p className="text-xs text-red-700">
                {String(form.formState.errors.executive_summary.message)}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              aria-label={t('confirmCheckbox')}
            />
            <span>{t('confirmCheckbox')}</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!confirmed || isSubmitting}>
              {isSubmitting ? '…' : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
