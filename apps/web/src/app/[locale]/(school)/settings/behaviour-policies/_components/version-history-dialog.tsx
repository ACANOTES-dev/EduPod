'use client';

import { useTranslations } from 'next-intl';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@school/ui';

// ─── Props ───────────────────────────────────────────────────────────────────

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  history: Array<Record<string, unknown>>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VersionHistoryDialog({
  open,
  onOpenChange,
  loading,
  history,
}: VersionHistoryDialogProps) {
  const t = useTranslations('behaviourSettings.policies');
  const tCommon = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('versionHistory')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-secondary" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('noVersionHistory')}</p>
        ) : (
          <div className="space-y-2">
            {history.map((v) => (
              <div key={v.id as string} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">v{String(v.version)}</span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(String(v.created_at)).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">{String(v.name)}</p>
                {v.change_reason ? (
                  <p className="mt-1 text-xs text-text-tertiary">{t('reason2')}{String(v.change_reason)}
                  </p>
                ) : null}
                {v.changed_by ? (
                  <p className="text-xs text-text-tertiary">{t('by')}{(v.changed_by as Record<string, string>).first_name}{' '}
                    {(v.changed_by as Record<string, string>).last_name}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{tCommon('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
