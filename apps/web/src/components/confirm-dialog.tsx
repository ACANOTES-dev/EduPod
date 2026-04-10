'use client';

import { AlertTriangle } from 'lucide-react';
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

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
//
// A small reusable confirmation dialog. Replaces ad-hoc `window.confirm()`
// calls so the UX stays consistent across the app and so we can style and
// localise the buttons properly. Built on the @school/ui Radix Dialog so it
// inherits the focus trap, escape-to-close, and click-outside behaviour.
//
// Variants:
//   - 'default' — neutral primary button (e.g., reschedule, save)
//   - 'destructive' — rose-coloured button (e.g., delete, cancel-request)
//   - 'warning' — amber button (e.g., close window, unpublish)

export type ConfirmDialogVariant = 'default' | 'destructive' | 'warning';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Called when the user clicks the confirm button. The caller is
   *  responsible for closing the dialog (typically by setting `open` to
   *  false in its own handler). */
  onConfirm: () => void | Promise<void>;
  /** When true, disables both buttons (e.g., while a mutation is in flight). */
  busy?: boolean;
  variant?: ConfirmDialogVariant;
}

const VARIANT_STYLES: Record<ConfirmDialogVariant, string> = {
  default: '',
  destructive: 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
  warning: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  busy = false,
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant !== 'default' && (
              <AlertTriangle
                className={`h-5 w-5 ${variant === 'destructive' ? 'text-rose-600' : 'text-amber-600'}`}
                aria-hidden="true"
              />
            )}
            {title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="min-h-11"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'default' ? 'default' : 'outline'}
            className={`min-h-11 ${VARIANT_STYLES[variant]}`}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
