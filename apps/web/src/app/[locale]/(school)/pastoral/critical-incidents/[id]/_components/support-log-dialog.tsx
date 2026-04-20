'use client';

import { Clock, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupportLogEntry {
  id: string;
  actor_user_id: string;
  offered_at: string;
  notes: string | null;
}

interface SupportLogResponse {
  data: SupportLogEntry[];
}

interface SupportLogDialogProps {
  incidentId: string;
  affectedPersonId: string | null;
  affectedPersonName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterRecord?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SupportLogDialog({
  incidentId,
  affectedPersonId,
  affectedPersonName,
  open,
  onOpenChange,
  onAfterRecord,
}: SupportLogDialogProps) {
  const t = useTranslations('responsePlans.supportLog');
  const [log, setLog] = React.useState<SupportLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refreshLog = React.useCallback(async () => {
    if (!affectedPersonId) return;
    setLoadingLog(true);
    setError(null);
    try {
      const response = await apiClient<SupportLogResponse>(
        `/api/v1/pastoral/critical-incidents/${incidentId}/affected/${affectedPersonId}/support`,
        { silent: true },
      );
      setLog(response.data ?? []);
    } catch (err: unknown) {
      console.error('[SupportLogDialog.refresh]', err);
      setLog([]);
      const apiError = err as { error?: { message?: string }; message?: string };
      setError(apiError.error?.message ?? apiError.message ?? t('errors.loadFailed'));
    } finally {
      setLoadingLog(false);
    }
  }, [affectedPersonId, incidentId, t]);

  React.useEffect(() => {
    if (open && affectedPersonId) {
      void refreshLog();
      setNotes('');
      setError(null);
    }
  }, [affectedPersonId, open, refreshLog]);

  const handleRecord = React.useCallback(async () => {
    if (!affectedPersonId || !notes.trim()) {
      setError(t('errors.notesRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient(
        `/api/v1/pastoral/critical-incidents/${incidentId}/affected/${affectedPersonId}/support`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: notes.trim() }),
          silent: true,
        },
      );
      setNotes('');
      await refreshLog();
      if (onAfterRecord) onAfterRecord();
    } catch (err: unknown) {
      const apiError = err as { error?: { message?: string }; message?: string };
      setError(apiError.error?.message ?? apiError.message ?? t('errors.recordFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [affectedPersonId, incidentId, notes, onAfterRecord, refreshLog, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title', { name: affectedPersonName })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-notes">{t('notesLabel')}</Label>
            <Textarea
              id="support-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('notesPlaceholder')}
              disabled={submitting}
            />
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={submitting || !notes.trim()}
                onClick={() => void handleRecord()}
              >
                {submitting ? t('recording') : t('recordEntry')}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-secondary/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <History className="h-4 w-4" aria-hidden="true" />
              {t('historyTitle', { count: log.length })}
            </div>

            {loadingLog ? (
              <p className="mt-3 text-sm text-text-tertiary">{t('loading')}</p>
            ) : log.length === 0 ? (
              <p className="mt-3 text-sm text-text-tertiary">{t('empty')}</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {log.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-xs text-text-tertiary">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {formatDateTime(entry.offered_at)}
                    </div>
                    {entry.notes ? (
                      <p className="mt-1 text-sm text-text-secondary">{entry.notes}</p>
                    ) : (
                      <p className="mt-1 text-sm italic text-text-tertiary">
                        {t('noNotesForEntry')}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
