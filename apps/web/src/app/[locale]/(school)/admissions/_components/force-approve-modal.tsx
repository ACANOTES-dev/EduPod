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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface ForceApproveModalProps {
  applicationId: string | null;
  expectedCents: number | null;
  currencyCode: string | null;
  open: boolean;
  onClose: () => void;
  onApproved: () => void;
}

type OverrideType = 'full_waiver' | 'partial_waiver' | 'deferred_payment';

export function ForceApproveModal({
  applicationId,
  expectedCents,
  currencyCode,
  open,
  onClose,
  onApproved,
}: ForceApproveModalProps) {
  const t = useTranslations('admissionsQueues');
  const [overrideType, setOverrideType] = React.useState<OverrideType>('full_waiver');
  const [collectedAmount, setCollectedAmount] = React.useState<string>('0');
  const [justification, setJustification] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setOverrideType('full_waiver');
      setCollectedAmount('0');
      setJustification('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!applicationId) return;
    const trimmed = justification.trim();
    if (trimmed.length < 20) {
      toast.error(t('forceApproveModal.errorTooShort'));
      return;
    }
    const cents = Math.round(Number(collectedAmount) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error(t('forceApproveModal.errorInvalidAmount'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/override`, {
        method: 'POST',
        body: JSON.stringify({
          override_type: overrideType,
          actual_amount_collected_cents: cents,
          justification: trimmed,
        }),
      });
      toast.success(t('forceApproveModal.success'));
      onApproved();
      onClose();
    } catch (err) {
      console.error('[ForceApproveModal]', err);
      toast.error(t('forceApproveModal.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('forceApproveModal.title')}</DialogTitle>
          <DialogDescription>
            {t('forceApproveModal.description', {
              expected:
                expectedCents !== null
                  ? `${(expectedCents / 100).toFixed(2)} ${currencyCode ?? ''}`.trim()
                  : '—',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="override-type">{t('forceApproveModal.typeLabel')}</Label>
            <Select
              value={overrideType}
              onValueChange={(value) => setOverrideType(value as OverrideType)}
            >
              <SelectTrigger id="override-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_waiver">{t('forceApproveModal.fullWaiver')}</SelectItem>
                <SelectItem value="partial_waiver">
                  {t('forceApproveModal.partialWaiver')}
                </SelectItem>
                <SelectItem value="deferred_payment">
                  {t('forceApproveModal.deferredPayment')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="collected-amount">{t('forceApproveModal.collectedAmountLabel')}</Label>
            <Input
              id="collected-amount"
              type="number"
              step="0.01"
              min={0}
              value={collectedAmount}
              onChange={(e) => setCollectedAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="justification">{t('forceApproveModal.justificationLabel')}</Label>
            <Textarea
              id="justification"
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t('forceApproveModal.justificationPlaceholder')}
              maxLength={2000}
            />
            <div className="text-xs text-text-tertiary">{t('forceApproveModal.minLengthHint')}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('common.working') : t('forceApproveModal.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
