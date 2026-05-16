'use client';

import { Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@school/ui';

import { OwnerActionConfirmDialog } from '@/components/platform/owner-action-confirm-dialog';

interface CleanConfirmDialogProps {
  children?: React.ReactNode;
  count: number;
  queueName: string;
  status: 'completed' | 'failed';
  onExecuted: () => void | Promise<void>;
}

export function CleanConfirmDialog({
  children,
  count,
  queueName,
  status,
  onExecuted,
}: CleanConfirmDialogProps) {
  const label = status === 'completed' ? 'completed' : 'failed';
  const phrase = `CLEAN ${label.toUpperCase()} ${queueName}`;

  return (
    <OwnerActionConfirmDialog
      action="queue_cleaned"
      confirmationPhrase={phrase}
      payload={{ queue: queueName, status, grace_ms: 0, limit: 1000 }}
      summary={`This removes up to 1000 ${label} jobs from the "${queueName}" queue. This action cannot be undone.`}
      targetLabel={`${queueName} / ${label} jobs (${count})`}
      targetResourceId={queueName}
      targetResourceType="queue"
      title={`Clean ${label} jobs`}
      onExecuted={onExecuted}
    >
      {children ?? (
        <Button type="button" size="sm" variant="destructive">
          <Trash2 className="me-1.5 h-3.5 w-3.5" />
          Clean {label}
        </Button>
      )}
    </OwnerActionConfirmDialog>
  );
}
