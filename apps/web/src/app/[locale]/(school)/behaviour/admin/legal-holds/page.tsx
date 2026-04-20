'use client';

import { ArrowLeft, Lock, Plus, ShieldCheck, Unlock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface LegalHold {
  id: string;
  entity_type: string;
  entity_id: string;
  hold_reason: string;
  legal_basis: string | null;
  status: string;
  set_by: { id: string; first_name: string; last_name: string };
  set_at: string;
  released_by: { id: string; first_name: string; last_name: string } | null;
  released_at: string | null;
  release_reason: string | null;
}

const ENTITY_TYPES = ['incident', 'sanction', 'intervention', 'appeal', 'exclusion_case'] as const;

export default function LegalHoldsPage() {
  const t = useTranslations('behaviourAdmin.legalHolds');
  const tShared = useTranslations('behaviourAdmin');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const [holds, setHolds] = React.useState<LegalHold[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<'active' | 'released'>('active');
  const [reloadKey, setReloadKey] = React.useState(0);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [releaseTarget, setReleaseTarget] = React.useState<LegalHold | null>(null);

  const canAccess = hasAnyRole('school_owner', 'school_principal');

  React.useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient<{ data: LegalHold[]; meta?: { total: number } }>(
      `/api/v1/behaviour/admin/legal-holds?status=${status}&pageSize=200`,
    )
      .then((res) => {
        if (!cancelled) setHolds(res.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setHolds([]);
        console.error('[LegalHoldsPage:fetch]', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canAccess, status, reloadKey]);

  if (!canAccess) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tShared('denied.body')}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t('actions.create')}
            </Button>
            <Link
              href={`/${locale}/behaviour/admin`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {t('actions.backToAdmin')}
            </Link>
          </div>
        }
      />

      {/* Status filter */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStatus('active')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            status === 'active'
              ? 'border-rose-300 bg-rose-50 text-rose-800'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
          }`}
        >
          {t('filters.active')}
        </button>
        <button
          type="button"
          onClick={() => setStatus('released')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            status === 'released'
              ? 'border-slate-300 bg-slate-50 text-slate-800'
              : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
          }`}
        >
          {t('filters.released')}
        </button>
      </div>

      {/* List */}
      <section className="rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : holds.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-text-tertiary/40" />
            <p className="text-sm text-text-tertiary">{t('empty.' + status)}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {holds.map((hold) => (
              <li key={hold.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {hold.entity_type}
                    </Badge>
                    <code className="text-xs text-text-tertiary">
                      {hold.entity_id.substring(0, 8)}…
                    </code>
                  </div>
                  <p className="mt-1 text-sm text-text-primary">{hold.hold_reason}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {t('setBy', {
                      name: `${hold.set_by.first_name} ${hold.set_by.last_name}`,
                      at: formatDateTime(hold.set_at),
                    })}
                  </p>
                  {hold.legal_basis && (
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {t('legalBasis')}: {hold.legal_basis}
                    </p>
                  )}
                  {hold.released_at && hold.released_by && (
                    <p className="mt-1 text-xs text-slate-700">
                      {t('releasedBy', {
                        name: `${hold.released_by.first_name} ${hold.released_by.last_name}`,
                        at: formatDateTime(hold.released_at),
                      })}
                      {hold.release_reason ? ` — ${hold.release_reason}` : ''}
                    </p>
                  )}
                </div>
                {status === 'active' && (
                  <Button size="sm" variant="secondary" onClick={() => setReleaseTarget(hold)}>
                    <Unlock className="me-1.5 h-3.5 w-3.5" />
                    {t('actions.release')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateHoldDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          setReloadKey((k) => k + 1);
        }}
      />

      <ReleaseHoldDialog
        hold={releaseTarget}
        onClose={() => setReleaseTarget(null)}
        onReleased={() => {
          setReleaseTarget(null);
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateHoldDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('behaviourAdmin.legalHolds.create');
  const [entityType, setEntityType] = React.useState<string>('incident');
  const [entityId, setEntityId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [legalBasis, setLegalBasis] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEntityType('incident');
      setEntityId('');
      setReason('');
      setLegalBasis('');
      setError(null);
    }
  }, [open]);

  const canSubmit = entityId.trim() && reason.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient('/api/v1/behaviour/admin/legal-holds', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId.trim(),
          hold_reason: reason.trim(),
          legal_basis: legalBasis.trim() || null,
          propagate: true,
        }),
      });
      onCreated();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('errors.generic'));
      console.error('[CreateHoldDialog:submit]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium">{t('entityType')}</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`entityTypes.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium">{t('entityId')}</Label>
            <Input
              className="mt-1 font-mono text-xs"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">{t('reason')}</Label>
            <Textarea
              rows={3}
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          <div>
            <Label className="text-xs font-medium">{t('legalBasis')}</Label>
            <Input
              className="mt-1"
              value={legalBasis}
              onChange={(e) => setLegalBasis(e.target.value)}
              placeholder={t('legalBasisPlaceholder')}
            />
          </div>
          {error && (
            <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || submitting}>
            {submitting ? t('submitting') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Release dialog ───────────────────────────────────────────────────────────

function ReleaseHoldDialog({
  hold,
  onClose,
  onReleased,
}: {
  hold: LegalHold | null;
  onClose: () => void;
  onReleased: () => void;
}) {
  const t = useTranslations('behaviourAdmin.legalHolds.release');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (hold) {
      setReason('');
      setError(null);
    }
  }, [hold]);

  if (!hold) return null;

  const submit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient(`/api/v1/behaviour/admin/legal-holds/${hold.id}/release`, {
        method: 'POST',
        body: JSON.stringify({
          release_reason: reason.trim(),
          release_linked: false,
        }),
      });
      onReleased();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? t('errors.generic'));
      console.error('[ReleaseHoldDialog:submit]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={hold !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('releasing')}
            </p>
            <p className="mt-1 text-sm text-text-primary">{hold.hold_reason}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {t('setContext', {
                type: hold.entity_type,
                at: new Date(hold.set_at).toLocaleDateString(),
              })}
            </p>
          </div>
          <div>
            <Label className="text-xs font-medium">{t('reason')}</Label>
            <Textarea
              rows={3}
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          {error && (
            <div className="rounded-lg border border-danger-300 bg-danger-50 p-2 text-xs text-danger-800">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void submit()}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? t('submitting') : t('release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
