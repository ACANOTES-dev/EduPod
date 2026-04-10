'use client';

import * as React from 'react';

import { Button, Label, Textarea, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface RejectDialogProps {
  open: boolean;
  applicationId: string;
  onClose: () => void;
  onRejected: () => void;
}

export function RejectDialog({ open, applicationId, onClose, onRejected }: RejectDialogProps) {
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('A rejection reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason }),
      });
      toast.success('Application rejected');
      onRejected();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject application';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">Reject application</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Enter a reason. It will be visible in the audit trail and notification to the applicant.
        </p>

        <div className="mt-4 space-y-2">
          <Label htmlFor="reject-reason">Rejection reason</Label>
          <Textarea
            id="reject-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || !reason.trim()}
            onClick={submit}
          >
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
