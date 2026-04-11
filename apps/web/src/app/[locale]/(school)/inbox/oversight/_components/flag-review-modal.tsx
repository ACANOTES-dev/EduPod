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
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface FlagReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flagId: string | null;
  action: 'dismiss' | 'escalate';
  onDone: (result?: { export_url?: string }) => void;
}

// Shared confirmation + notes modal for the two flag actions. POSTs to
// `/v1/inbox/oversight/flags/:id/dismiss` or `.../escalate` with the
// required review notes, then bubbles the result (dismiss returns
// nothing; escalate returns a presigned PDF URL) to the caller.
export function FlagReviewModal({
  open,
  onOpenChange,
  flagId,
  action,
  onDone,
}: FlagReviewModalProps) {
  const t = useTranslations('inbox.oversight');
  const tc = useTranslations('common');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const submit = async () => {
    if (!flagId || notes.trim().length === 0) {
      toast.error(t('flag.notesRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiClient<{ export_url?: string }>(
        `/api/v1/inbox/oversight/flags/${flagId}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: notes.trim() }),
        },
      );
      toast.success(action === 'dismiss' ? t('flag.dismissed') : t('flag.escalated'));
      onOpenChange(false);
      onDone(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('flag.actionFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = action === 'dismiss' ? t('flag.dismissTitle') : t('flag.escalateTitle');
  const description =
    action === 'dismiss' ? t('flag.dismissDescription') : t('flag.escalateDescription');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="flag-notes">{t('flag.notesLabel')}</Label>
          <Textarea
            id="flag-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('flag.notesPlaceholder')}
            className="text-base"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            variant={action === 'dismiss' ? 'outline' : 'destructive'}
            onClick={() => {
              void submit();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? tc('saving') : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
