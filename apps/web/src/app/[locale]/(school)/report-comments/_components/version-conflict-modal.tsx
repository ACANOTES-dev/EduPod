'use client';

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
  Textarea,
} from '@school/ui';

export interface VersionConflictState {
  studentId: string;
  studentName: string;
  myDraft: string;
  serverText: string;
  serverUpdatedAt: string | null;
}

interface Props {
  state: VersionConflictState | null;
  onClose: () => void;
  onKeepMine: (state: VersionConflictState, mergedText: string) => void;
  onUseServer: (state: VersionConflictState) => void;
}

/**
 * Shown when a concurrent-edit 409 comes back from the server. The teacher's
 * in-progress draft is always preserved in the top textarea so nothing is
 * ever lost — the modal's whole purpose is to give them a side-by-side view
 * and let them decide whether to keep, merge, or discard their draft.
 */
export function VersionConflictModal({ state, onClose, onKeepMine, onUseServer }: Props) {
  const t = useTranslations('reportComments.conflict');
  const [merged, setMerged] = React.useState('');

  React.useEffect(() => {
    if (state) setMerged(state.myDraft);
  }, [state]);

  const open = state !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {state ? t('description', { name: state.studentName }) : ''}
          </DialogDescription>
        </DialogHeader>

        {state && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('myDraftLabel')}
              </label>
              <Textarea
                value={merged}
                onChange={(e) => setMerged(e.target.value)}
                rows={5}
                className="mt-1.5 w-full text-base"
                aria-label={t('myDraftLabel')}
              />
              <p className="mt-1 text-xs text-text-tertiary">{t('myDraftHint')}</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('serverTextLabel')}
              </label>
              <div
                className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-secondary p-3 text-sm text-text-primary whitespace-pre-wrap"
                dir="auto"
              >
                {state.serverText || <span className="text-text-tertiary">{t('empty')}</span>}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
            {t('cancel')}
          </Button>
          {state && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onUseServer(state)}
                className="min-h-11"
              >
                {t('useServer')}
              </Button>
              <Button
                type="button"
                onClick={() => onKeepMine(state, merged)}
                disabled={merged.trim().length === 0}
                className="min-h-11"
              >
                {t('keepMine')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
