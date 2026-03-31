'use client';

import {
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

import type { StaffOption } from './exclusion-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decisionValue: string;
  onDecisionValueChange: (val: string) => void;
  decisionReasoning: string;
  onDecisionReasoningChange: (val: string) => void;
  conditionsReturn: string;
  onConditionsReturnChange: (val: string) => void;
  conditionsTransfer: string;
  onConditionsTransferChange: (val: string) => void;
  decidedById: string;
  onDecidedByIdChange: (val: string) => void;
  staffOptions: StaffOption[];
  submitting: boolean;
  actionError: string;
  onSubmit: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DecisionDialog({
  open,
  onOpenChange,
  decisionValue,
  onDecisionValueChange,
  decisionReasoning,
  onDecisionReasoningChange,
  conditionsReturn,
  onConditionsReturnChange,
  conditionsTransfer,
  onConditionsTransferChange,
  decidedById,
  onDecidedByIdChange,
  staffOptions,
  submitting,
  actionError,
  onSubmit,
}: DecisionDialogProps) {
  const t = useTranslations('behaviour.exclusionDetail');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('recordExclusionDecision')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Decision</label>
            <Select value={decisionValue} onValueChange={onDecisionValueChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select decision..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusion_confirmed">Exclusion Confirmed</SelectItem>
                <SelectItem value="exclusion_modified">Exclusion Modified</SelectItem>
                <SelectItem value="exclusion_reversed">Exclusion Reversed</SelectItem>
                <SelectItem value="alternative_consequence">Alternative Consequence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Reasoning *</label>
            <Textarea
              value={decisionReasoning}
              onChange={(e) => onDecisionReasoningChange(e.target.value)}
              placeholder="Explain the reasoning for this decision (min 10 characters)..."
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Decided By</label>
            <Select value={decidedById} onValueChange={onDecidedByIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => {
                  const name = s.user
                    ? `${s.user.first_name} ${s.user.last_name}`
                    : s.first_name && s.last_name
                      ? `${s.first_name} ${s.last_name}`
                      : s.id;
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Conditions for Return</label>
            <Textarea
              value={conditionsReturn}
              onChange={(e) => onConditionsReturnChange(e.target.value)}
              placeholder="Conditions the student must meet to return..."
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Conditions for Transfer</label>
            <Textarea
              value={conditionsTransfer}
              onChange={(e) => onConditionsTransferChange(e.target.value)}
              placeholder="Conditions for managed move / transfer..."
              rows={2}
            />
          </div>

          {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || !decisionValue || decisionReasoning.length < 10 || !decidedById}
          >
            {submitting ? 'Submitting...' : 'Submit Decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
