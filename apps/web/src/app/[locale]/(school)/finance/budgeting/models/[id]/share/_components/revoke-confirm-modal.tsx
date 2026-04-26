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
  linkId: string | null;
  tokenSuffix: string | null;
  onClose: () => void;
  onRevoked: () => void;
}

export function RevokeConfirmModal({
  open,
  modelId,
  snapshotId,
  linkId,
  tokenSuffix,
  onClose,
  onRevoked,
}: Props) {
  const t = useTranslations('financeBudgetingShare.revokeConfirm');
  const [isRevoking, setIsRevoking] = React.useState<boolean>(false);

  const onConfirm = async (): Promise<void> => {
    if (!snapshotId || !linkId) return;
    setIsRevoking(true);
    try {
      await apiClient<void>(
        `/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}/links/${linkId}/revoke`,
        { method: 'POST', body: JSON.stringify({}), silent: true },
      );
      toast.success(t('revokedToast'));
      onRevoked();
      onClose();
    } catch (err) {
      console.error('[RevokeConfirmModal.submit]', err);
      const apiErr = err as { error?: { message?: string } };
      toast.error(apiErr?.error?.message ?? t('failed'));
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { suffix: tokenSuffix ?? '' })}</DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isRevoking}>
            {t('cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isRevoking}>
            {isRevoking ? '…' : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
