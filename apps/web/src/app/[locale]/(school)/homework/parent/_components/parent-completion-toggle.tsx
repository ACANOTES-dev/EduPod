'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParentCompletionToggleProps {
  assignmentId: string;
  currentStatus: string | null;
  onComplete: (assignmentId: string) => void;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParentCompletionToggle({
  assignmentId,
  currentStatus,
  onComplete,
  loading,
}: ParentCompletionToggleProps) {
  const t = useTranslations('homework');
  const [confirming, setConfirming] = React.useState(false);

  if (currentStatus === 'completed') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle className="h-3.5 w-3.5" />
        {t('parent.completed')}
      </span>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{t('parent.markAsDoneConfirm')}</span>
        <Button
          size="sm"
          variant="default"
          disabled={loading}
          onClick={() => {
            onComplete(assignmentId);
            setConfirming(false);
          }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('common.confirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      <CheckCircle className="me-1.5 h-3.5 w-3.5" />
      {t('parent.markAsDone')}
    </Button>
  );
}
