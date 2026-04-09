'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface ExtendWindowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windowId: string | null;
  currentClosesAt: string | null;
  onSuccess: () => void;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ExtendWindowModal({
  open,
  onOpenChange,
  windowId,
  currentClosesAt,
  onSuccess,
}: ExtendWindowModalProps) {
  const t = useTranslations('reportComments.extendModal');
  const tc = useTranslations('common');
  const [closesAt, setClosesAt] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClosesAt(toLocalInput(currentClosesAt));
    }
  }, [open, currentClosesAt]);

  const handleSubmit = async (): Promise<void> => {
    if (!windowId || !closesAt) return;
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/report-comment-windows/${windowId}/extend`, {
        method: 'PATCH',
        body: JSON.stringify({ closes_at: new Date(closesAt).toISOString() }),
      });
      toast.success(t('success'));
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error('[ExtendWindowModal]', err);
      toast.error(t('failure'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="extend_closes_at">{t('closesAtLabel')}</Label>
            <input
              id="extend_closes_at"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            />
          </div>
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
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting || !closesAt || !windowId}
            className="min-h-11"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
