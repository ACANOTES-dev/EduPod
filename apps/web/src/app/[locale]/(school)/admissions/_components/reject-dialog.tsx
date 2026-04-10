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
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface RejectDialogProps {
  applicationId: string | null;
  open: boolean;
  onClose: () => void;
  onRejected: () => void;
}

export function RejectDialog({ applicationId, open, onClose, onRejected }: RejectDialogProps) {
  const t = useTranslations('admissionsQueues');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleSubmit = async () => {
    if (!applicationId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error(t('rejectDialog.errorTooShort'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'rejected',
          rejection_reason: trimmed,
          expected_updated_at: new Date().toISOString(),
        }),
      });
      toast.success(t('rejectDialog.success'));
      onRejected();
      onClose();
    } catch (err) {
      console.error('[RejectDialog]', err);
      toast.error(t('rejectDialog.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rejectDialog.title')}</DialogTitle>
          <DialogDescription>{t('rejectDialog.description')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder={t('rejectDialog.placeholder')}
          maxLength={2000}
        />
        <div className="text-xs text-text-tertiary">{t('rejectDialog.minLengthHint')}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('common.working') : t('rejectDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
