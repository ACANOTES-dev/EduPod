'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { STATUS_COLORS, STATUS_TRANSITIONS } from './intervention-types';

import { apiClient } from '@/lib/api-client';


// ─── Props ────────────────────────────────────────────────────────────────────

interface StatusTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interventionId: string;
  currentStatus: string;
  initialNewStatus: string;
  onTransitionComplete: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusTransitionDialog({
  open,
  onOpenChange,
  interventionId,
  currentStatus,
  initialNewStatus,
  onTransitionComplete,
}: StatusTransitionDialogProps) {
  const t = useTranslations('behaviour.interventionDetail');
  const [newStatus, setNewStatus] = React.useState(initialNewStatus);
  const [transitionReason, setTransitionReason] = React.useState('');
  const [transitioning, setTransitioning] = React.useState(false);
  const [transitionError, setTransitionError] = React.useState('');

  const availableTransitions = STATUS_TRANSITIONS[currentStatus] ?? [];

  React.useEffect(() => {
    setNewStatus(initialNewStatus);
  }, [initialNewStatus]);

  const handleStatusTransition = async () => {
    if (!newStatus) return;
    setTransitioning(true);
    setTransitionError('');
    try {
      await apiClient(`/api/v1/behaviour/interventions/${interventionId}/transition`, {
        method: 'POST',
        body: JSON.stringify({
          status: newStatus,
          reason: transitionReason.trim() || undefined,
        }),
      });
      onOpenChange(false);
      setNewStatus('');
      setTransitionReason('');
      onTransitionComplete();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setTransitionError(ex?.error?.message ?? 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialog.changeStatus')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="mb-1 text-xs text-text-tertiary">
              Current:{' '}
              <Badge
                variant="secondary"
                className={`capitalize ${STATUS_COLORS[currentStatus] ?? ''}`}
              >
                {currentStatus.replace(/_/g, ' ')}
              </Badge>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">New Status</label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status..." />
              </SelectTrigger>
              <SelectContent>
                {availableTransitions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Reason (optional)</label>
            <Textarea
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              placeholder="Why is this changing?"
              rows={2}
            />
          </div>
          {transitionError && <p className="text-sm text-danger-text">{transitionError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transitioning}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void handleStatusTransition()}
            disabled={transitioning || !newStatus}
          >
            {transitioning ? t('updating') : t('updateStatus')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
