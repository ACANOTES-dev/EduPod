'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { rejectTeacherRequestSchema, type RejectTeacherRequestDto } from '@school/shared';
import {
  Button,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  onRejected: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RejectModal({ open, onOpenChange, requestId, onRejected }: RejectModalProps) {
  const t = useTranslations('reportCards.requests.detail.rejectModal');
  const tc = useTranslations('common');

  const form = useForm<RejectTeacherRequestDto>({
    resolver: zodResolver(rejectTeacherRequestSchema),
    defaultValues: { review_note: '' },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({ review_note: '' });
    }
  }, [open, form]);

  const onSubmit = async (values: RejectTeacherRequestDto): Promise<void> => {
    try {
      await apiClient(`/api/v1/report-card-teacher-requests/${requestId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ review_note: values.review_note.trim() }),
      });
      toast.success(t('success'));
      onOpenChange(false);
      onRejected();
    } catch (err) {
      console.error('[RejectModal]', err);
      toast.error(t('failure'));
    }
  };

  const errors = form.formState.errors;
  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void form.handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="reject_note">{t('noteLabel')}</Label>
            <Textarea
              id="reject_note"
              rows={4}
              placeholder={t('notePlaceholder')}
              className="text-base"
              {...form.register('review_note')}
            />
            {errors.review_note && <p className="text-xs text-red-600">{t('noteRequired')}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-h-11"
            >
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="destructive"
              className="min-h-11"
            >
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
