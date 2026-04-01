'use client';

import { Loader2 } from 'lucide-react';
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
} from '@school/ui';

import type { Survey } from './survey-types';

import { apiClient } from '@/lib/api-client';


// ─── Props ────────────────────────────────────────────────────────────────────

interface ConfirmAction {
  type: 'activate' | 'close';
  surveyId: string;
}

interface SurveyConfirmDialogProps {
  confirmAction: ConfirmAction | null;
  onClose: () => void;
  onConfirmed: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SurveyConfirmDialog({
  confirmAction,
  onClose,
  onConfirmed,
}: SurveyConfirmDialogProps) {
  const t = useTranslations('wellbeing.surveys');
  const [isConfirming, setIsConfirming] = React.useState(false);

  async function handleConfirm() {
    if (!confirmAction) return;
    setIsConfirming(true);

    const endpoint =
      confirmAction.type === 'activate'
        ? `/api/v1/staff-wellbeing/surveys/${confirmAction.surveyId}/activate`
        : `/api/v1/staff-wellbeing/surveys/${confirmAction.surveyId}/close`;

    try {
      await apiClient<Survey>(endpoint, { method: 'POST' });
      onClose();
      onConfirmed();
    } catch (err) {
      console.error('[SurveyConfirmDialog]', err);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Dialog
      open={confirmAction !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirmAction?.type === 'activate' ? t('activate') : t('close')}
          </DialogTitle>
          <DialogDescription>
            {confirmAction?.type === 'activate' ? t('activateConfirm') : t('closeConfirm')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={isConfirming}>
            {isConfirming && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
            {confirmAction?.type === 'activate' ? t('activate') : t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
