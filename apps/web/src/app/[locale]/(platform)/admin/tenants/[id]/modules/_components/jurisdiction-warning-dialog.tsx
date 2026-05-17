'use client';

import { ShieldAlert } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@school/ui';

interface JurisdictionWarningDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}

export function JurisdictionWarningDialog({
  onCancel,
  onConfirm,
  open,
}: JurisdictionWarningDialogProps) {
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setConfirmed(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-bg text-warning-text">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <DialogTitle>Confirm Irish jurisdiction</DialogTitle>
          <DialogDescription>
            Advanced compliance reporting includes Ireland-specific DES, TUSLA, PPOD, CBA, and
            regulatory-return surfaces.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-secondary p-3">
          <Checkbox
            id="confirm-ireland"
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <span className="space-y-1">
            <Label htmlFor="confirm-ireland" className="cursor-pointer text-sm text-text-primary">
              I confirm this tenant operates in Ireland.
            </Label>
            <span className="block text-xs text-text-secondary">
              This does not change core GDPR tooling, which remains always available.
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!confirmed} onClick={onConfirm}>
            Enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
