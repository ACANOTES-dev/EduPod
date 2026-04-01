'use client';

import { Pin, PinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface PinToggleProps {
  scheduleId: string;
  isPinned: boolean;
  onToggle?: (pinned: boolean) => void;
  disabled?: boolean;
}

export function PinToggle({ scheduleId, isPinned, onToggle, disabled }: PinToggleProps) {
  const t = useTranslations('scheduling.auto');
  const [loading, setLoading] = React.useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    try {
      const endpoint = isPinned
        ? `/api/v1/schedules/${scheduleId}/unpin`
        : `/api/v1/schedules/${scheduleId}/pin`;
      await apiClient(endpoint, { method: 'POST' });
      onToggle?.(!isPinned);
    } catch {
      toast.error('Failed to update pin status');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={disabled || loading}
      title={isPinned ? t('unpinEntry') : t('pinEntry')}
      className="h-7 w-7 p-0"
    >
      {isPinned ? (
        <Pin className="h-3.5 w-3.5 text-amber-500" />
      ) : (
        <PinOff className="h-3.5 w-3.5 text-text-tertiary" />
      )}
    </Button>
  );
}
