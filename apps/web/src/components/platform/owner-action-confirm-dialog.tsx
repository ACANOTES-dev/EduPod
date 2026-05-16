'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { PlatformAuditActionDto } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

const ownerActionFormSchema = z.object({
  typed_confirmation: z.string().trim().min(1, 'Type the confirmation phrase.'),
  reason: z.string().trim().min(12, 'Give a clear reason.'),
});

type OwnerActionFormValues = z.infer<typeof ownerActionFormSchema>;

interface OwnerActionConfirmDialogProps {
  action: PlatformAuditActionDto;
  children: React.ReactNode;
  confirmationPhrase: string;
  payload: unknown;
  summary: string;
  targetLabel: string;
  targetResourceId?: string;
  targetResourceType: string;
  targetTenantId?: string;
  title: string;
  onExecuted?: () => void | Promise<void>;
}

interface OwnerActionResponse {
  confirmation_id: string;
  execution_status: 'executed' | 'failed';
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export function OwnerActionConfirmDialog({
  action,
  children,
  confirmationPhrase,
  payload,
  summary,
  targetLabel,
  targetResourceId,
  targetResourceType,
  targetTenantId,
  title,
  onExecuted,
}: OwnerActionConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<OwnerActionFormValues>({
    resolver: zodResolver(ownerActionFormSchema),
    defaultValues: { typed_confirmation: '', reason: '' },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset({ typed_confirmation: '', reason: '' });
    }
  }, [form, open]);

  async function submit(values: OwnerActionFormValues) {
    try {
      setSubmitting(true);
      const result = await apiClient<OwnerActionResponse>('/api/v1/admin/action-confirmations', {
        method: 'POST',
        body: JSON.stringify({
          action,
          target_resource_type: targetResourceType,
          target_resource_id: targetResourceId,
          target_tenant_id: targetTenantId,
          payload,
          confirmation_phrase: confirmationPhrase,
          typed_confirmation: values.typed_confirmation,
          reason: values.reason,
        }),
      });

      if (result.execution_status === 'failed') {
        toast.error('Action confirmation was recorded, but execution failed.');
        return;
      }

      toast.success('Action executed.');
      setOpen(false);
      await onExecuted?.();
    } catch (err: unknown) {
      console.error('[OwnerActionConfirmDialog.submit]', err);
      toast.error(getErrorMessage(err, 'Could not execute the confirmed action.'));
    } finally {
      setSubmitting(false);
    }
  }

  const typed = form.watch('typed_confirmation');
  const isPhraseMatched = typed === confirmationPhrase;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger-text" />
            {title}
          </DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Target
            </p>
            <p className="mt-1 break-all text-sm font-semibold text-text-primary">{targetLabel}</p>
          </div>

          <div>
            <Label htmlFor="owner-action-phrase">Confirmation phrase</Label>
            <p className="mt-1 rounded-lg border border-warning-200 bg-warning-bg px-3 py-2 font-mono text-xs text-warning-text">
              {confirmationPhrase}
            </p>
            <Input
              id="owner-action-phrase"
              className="mt-2"
              autoComplete="off"
              {...form.register('typed_confirmation')}
            />
            {form.formState.errors.typed_confirmation ? (
              <p className="mt-1 text-xs text-danger-text">
                {form.formState.errors.typed_confirmation.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="owner-action-reason">Reason</Label>
            <Textarea
              id="owner-action-reason"
              className="mt-1 min-h-24"
              {...form.register('reason')}
            />
            {form.formState.errors.reason ? (
              <p className="mt-1 text-xs text-danger-text">
                {form.formState.errors.reason.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting || !isPhraseMatched}>
              Confirm and execute
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
