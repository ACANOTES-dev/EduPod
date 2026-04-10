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

interface ManualPromoteDialogProps {
  applicationId: string | null;
  open: boolean;
  onClose: () => void;
  onPromoted: () => void;
}

export function ManualPromoteDialog({
  applicationId,
  open,
  onClose,
  onPromoted,
}: ManualPromoteDialogProps) {
  const t = useTranslations('admissionsQueues');
  const [justification, setJustification] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setJustification('');
  }, [open]);

  const handleSubmit = async () => {
    if (!applicationId) return;
    const trimmed = justification.trim();
    if (trimmed.length < 10) {
      toast.error(t('manualPromoteDialog.errorTooShort'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/manual-promote`, {
        method: 'POST',
        body: JSON.stringify({ justification: trimmed }),
      });
      toast.success(t('manualPromoteDialog.success'));
      onPromoted();
      onClose();
    } catch (err) {
      console.error('[ManualPromoteDialog]', err);
      toast.error(t('manualPromoteDialog.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('manualPromoteDialog.title')}</DialogTitle>
          <DialogDescription>{t('manualPromoteDialog.description')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={4}
          placeholder={t('manualPromoteDialog.placeholder')}
          maxLength={2000}
        />
        <div className="text-xs text-text-tertiary">{t('manualPromoteDialog.minLengthHint')}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('common.working') : t('manualPromoteDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
