'use client';

import { Loader2 } from 'lucide-react';
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

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

interface SupportActionDialogProps {
  confirmLabel: string;
  description: string;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  variant: 'default' | 'destructive';
}

export function SupportActionDialog({
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
  variant,
}: SupportActionDialogProps) {
  const [loading, setLoading] = React.useState(false);

  async function confirm() {
    try {
      setLoading(true);
      await onConfirm();
      toast.success('Support action completed.');
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[SupportActionDialog.confirm]', err);
      toast.error(getErrorMessage(err, 'Support action failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={loading}
          >
            {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Working...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
