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
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Props {
  open: boolean;
  modelId: string;
  snapshotId: string | null;
  versionNumber: number | null;
  onClose: () => void;
  onRestored: (versionNumber: number) => void;
}

export function RestoreConfirmModal({
  open,
  modelId,
  snapshotId,
  versionNumber,
  onClose,
  onRestored,
}: Props) {
  const t = useTranslations('financeBudgetingSnapshots.restoreModal');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const handleConfirm = async (): Promise<void> => {
    if (!snapshotId || versionNumber === null) return;
    setSubmitting(true);
    try {
      await apiClient(
        `/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}/restore`,
        { method: 'POST' },
      );
      onRestored(versionNumber);
      onClose();
    } catch (err) {
      console.error('[RestoreConfirmModal.submit]', err);
      toast.error(t('failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {versionNumber !== null ? t('title', { n: versionNumber }) : ''}
          </DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || !snapshotId || versionNumber === null}
          >
            {submitting ? '…' : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
