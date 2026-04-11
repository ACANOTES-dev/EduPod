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

interface FreezeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  onFrozen: () => void;
}

// Freeze confirmation. The backend requires a non-empty reason (see
// `freezeConversationBodySchema`) so submit disables until text is
// present.
export function FreezeDialog({ open, onOpenChange, conversationId, onFrozen }: FreezeDialogProps) {
  const t = useTranslations('inbox.oversight');
  const tc = useTranslations('common');
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const submit = async () => {
    if (!conversationId || reason.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/inbox/oversight/conversations/${conversationId}/freeze`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success(t('freeze.success'));
      onOpenChange(false);
      onFrozen();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('freeze.error');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('freeze.confirm.title')}</DialogTitle>
          <DialogDescription>{t('freeze.confirm.body')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="freeze-reason">{t('freeze.reason.label')}</Label>
          <Textarea
            id="freeze-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('freeze.reason.placeholder')}
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
            variant="destructive"
            onClick={() => {
              void submit();
            }}
            disabled={isSubmitting || reason.trim().length === 0}
          >
            {isSubmitting ? tc('saving') : t('actions.freeze')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
