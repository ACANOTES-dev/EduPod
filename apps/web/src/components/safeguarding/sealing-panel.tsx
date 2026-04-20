'use client';

import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

interface SealStatus {
  concern_id: string;
  state: 'not_initiated' | 'pending_approval' | 'sealed';
  initiated_by_id: string | null;
  initiated_reason: string | null;
  approved_by_id: string | null;
  sealed_at: string | null;
}

interface SealingPanelProps {
  concernId: string;
}

/**
 * Dual-approval sealing controls for a safeguarding concern. Fetches
 * `seal-status` once; if the endpoint returns 404 (concern is not
 * safeguarding-tier) the panel renders nothing. Same-user dual approval
 * is blocked in the UI AND the backend — we hide the approve/reject
 * buttons for the initiator.
 */
export function SealingPanel({ concernId }: SealingPanelProps) {
  const t = useTranslations('safeguardingSealing');
  const { user } = useAuth();
  const { hasAnyRole } = useRoleCheck();

  const [status, setStatus] = React.useState<SealStatus | null>(null);
  const [visible, setVisible] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);

  // Dialog state (one dialog per action; simpler than a single
  // mode-switched dialog)
  const [openAction, setOpenAction] = React.useState<'seal' | 'approve' | 'reject' | null>(null);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Owner / principal / VP may initiate or approve seals (matches impl 01's
  // safeguarding.seal permission grant).
  const canSeal = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');

  React.useEffect(() => {
    if (!canSeal || !concernId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient<SealStatus>(`/api/v1/safeguarding/concerns/${concernId}/seal-status`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        setVisible(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const ex = err as { error?: { code?: string } };
        if (ex?.error?.code === 'CONCERN_NOT_FOUND') {
          // Not a safeguarding concern — hide the panel entirely
          setVisible(false);
        } else {
          console.error('[SealingPanel:fetch]', err);
          setVisible(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [concernId, canSeal, reloadKey]);

  const closeDialog = () => {
    setOpenAction(null);
    setReason('');
    setError(null);
  };

  const submit = async (action: 'seal' | 'approve' | 'reject') => {
    setSubmitting(true);
    setError(null);
    try {
      if (action === 'seal') {
        if (!reason.trim()) throw new Error(t('errors.reasonRequired'));
        await apiClient(`/api/v1/safeguarding/concerns/${concernId}/seal/initiate`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        });
      } else if (action === 'approve') {
        await apiClient(`/api/v1/safeguarding/concerns/${concernId}/seal/approve`, {
          method: 'POST',
          body: JSON.stringify({ confirmation: true }),
        });
      } else {
        if (!reason.trim()) throw new Error(t('errors.reasonRequired'));
        await apiClient(`/api/v1/safeguarding/concerns/${concernId}/seal/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        });
      }
      closeDialog();
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setError(ex?.error?.message ?? ex?.message ?? t('errors.generic'));
      console.error('[SealingPanel:submit]', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canSeal || !visible || loading) return null;
  if (!status) return null;

  const isInitiator = status.initiated_by_id !== null && status.initiated_by_id === user?.id;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <header className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-rose-600" />
        <h2 className="text-sm font-semibold text-text-primary">{t('title')}</h2>
      </header>

      {status.state === 'not_initiated' && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-text-secondary">{t('notInitiated.body')}</p>
          <Button variant="secondary" size="sm" onClick={() => setOpenAction('seal')}>
            <Lock className="me-1.5 h-4 w-4" />
            {t('notInitiated.cta')}
          </Button>
        </div>
      )}

      {status.state === 'pending_approval' && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-warning-300 bg-warning-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" />
              <div className="text-xs text-warning-900">
                <p className="font-medium">{t('pending.title')}</p>
                <p className="mt-1 whitespace-pre-wrap">{status.initiated_reason}</p>
              </div>
            </div>
          </div>
          {isInitiator ? (
            <p className="text-xs text-text-tertiary">{t('pending.initiatorNote')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setOpenAction('approve')}>
                <Lock className="me-1.5 h-4 w-4" />
                {t('pending.approve')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpenAction('reject')}>
                {t('pending.reject')}
              </Button>
            </div>
          )}
        </div>
      )}

      {status.state === 'sealed' && (
        <div className="mt-3 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">
            <Lock className="h-3.5 w-3.5" />
            {t('sealed.badge')}
          </div>
          <p className="text-xs text-text-tertiary">
            {status.sealed_at ? t('sealed.at', { at: formatDateTime(status.sealed_at) }) : null}
          </p>
        </div>
      )}

      {/* Seal initiate dialog */}
      <Dialog open={openAction === 'seal'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('notInitiated.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{t('notInitiated.dialogBody')}</p>
            <Label htmlFor="seal-reason">{t('notInitiated.reasonLabel')}</Label>
            <Textarea
              id="seal-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('notInitiated.reasonPlaceholder')}
            />
            {error && (
              <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submit('seal')} disabled={!reason.trim() || submitting}>
              {submitting ? t('submitting') : t('notInitiated.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={openAction === 'approve'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pending.approveTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-secondary p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('pending.initiatorReason')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                {status.initiated_reason}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
              <p className="text-xs text-rose-800">{t('pending.approveWarning')}</p>
            </div>
            {error && (
              <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submit('approve')} disabled={submitting}>
              {submitting ? t('submitting') : t('pending.approveConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={openAction === 'reject'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pending.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason">{t('pending.rejectReasonLabel')}</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('pending.rejectReasonPlaceholder')}
            />
            {error && (
              <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submit('reject')} disabled={!reason.trim() || submitting}>
              {submitting ? t('submitting') : t('pending.rejectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
