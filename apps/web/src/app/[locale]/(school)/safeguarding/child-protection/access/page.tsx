'use client';

import {
  AlertTriangle,
  KeySquare,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
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
  Input,
  Label,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CpAccessGrant {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

interface StaffResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CpAccessPage() {
  const t = useTranslations('childProtectionHub.access');
  const tRoot = useTranslations('childProtectionHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole(...ADMIN_ROLES);

  const [grants, setGrants] = React.useState<CpAccessGrant[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [grantDialogOpen, setGrantDialogOpen] = React.useState(false);
  const [staffQuery, setStaffQuery] = React.useState('');
  const [staffResults, setStaffResults] = React.useState<StaffResult[]>([]);
  const [selectedStaff, setSelectedStaff] = React.useState<StaffResult | null>(null);
  const [granting, setGranting] = React.useState(false);

  const [revokeTarget, setRevokeTarget] = React.useState<CpAccessGrant | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [revoking, setRevoking] = React.useState(false);

  // ── Load grants ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // The list endpoint path is /access/student/:studentId, but the service
    // method listActive ignores studentId — it's a quirk documented in the
    // controller comment. We pass a zero UUID as a required-path placeholder.
    const PROBE_UUID = '00000000-0000-4000-8000-000000000000';
    apiClient<{ data: CpAccessGrant[] }>(`/api/v1/child-protection/access/student/${PROBE_UUID}`)
      .then((res) => {
        if (!cancelled) setGrants(res.data ?? []);
      })
      .catch((err) => {
        console.error('[CpAccess] load failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, reloadKey, t]);

  // ── Staff search inside grant dialog ─────────────────────────────────────
  React.useEffect(() => {
    const trimmed = staffQuery.trim();
    if (trimmed.length < 2) {
      setStaffResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      apiClient<{ data: StaffResult[] }>(
        `/api/v1/staff?search=${encodeURIComponent(trimmed)}&pageSize=8`,
      )
        .then((res) => {
          if (!cancelled) setStaffResults(res.data ?? []);
        })
        .catch((err) => console.error('[CpAccess] staff search failed', err));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [staffQuery]);

  const handleGrant = async () => {
    if (!selectedStaff) return;
    setGranting(true);
    try {
      await apiClient('/api/v1/child-protection/access/grant', {
        method: 'POST',
        body: JSON.stringify({ user_id: selectedStaff.id }),
      });
      toast.success(t('grant.toastSuccess'));
      setGrantDialogOpen(false);
      setSelectedStaff(null);
      setStaffQuery('');
      setStaffResults([]);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[CpAccess.grant]', err);
      const e = err as { error?: { message?: string } };
      toast.error(e?.error?.message ?? t('grant.toastFailed'));
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || !revokeReason.trim()) return;
    setRevoking(true);
    try {
      await apiClient(`/api/v1/child-protection/access/${revokeTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revocation_reason: revokeReason.trim() }),
      });
      toast.success(t('revoke.toastSuccess'));
      setRevokeTarget(null);
      setRevokeReason('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error('[CpAccess.revoke]', err);
      const e = err as { error?: { message?: string } };
      toast.error(e?.error?.message ?? t('revoke.toastFailed'));
    } finally {
      setRevoking(false);
    }
  };

  if (!canManage) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{
            href: `/${locale}/safeguarding/child-protection`,
            label: tRoot('back'),
          }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-text-primary">{tRoot('denied.title')}</h2>
            <p className="text-sm text-text-secondary">{tRoot('denied.body')}</p>
          </div>
        </section>
      </div>
    );
  }

  const activeGrants = grants.filter((g) => !g.revoked_at);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{
          href: `/${locale}/safeguarding/child-protection`,
          label: tRoot('back'),
        }}
        actions={
          <Button type="button" size="sm" onClick={() => setGrantDialogOpen(true)}>
            <UserPlus className="me-1.5 h-3.5 w-3.5" />
            {t('grantCta')}
          </Button>
        }
      />

      {/* ── Info banner ─────────────────────────────────────────────────── */}
      <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-200/80 text-amber-800">
          <KeySquare className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-amber-900">{t('info.title')}</p>
          <p className="text-xs text-amber-800">{t('info.body')}</p>
        </div>
      </section>

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tRoot('retry')}
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-text-tertiary">
          <span>{t('resultCount', { count: activeGrants.length })}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {t('activeOnly')}
          </span>
        </header>
        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 3 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-1/4 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : activeGrants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <KeySquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="max-w-md text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {activeGrants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                    <UserCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {grant.user_name ?? t('anonymousUser')}
                    </p>
                    {grant.user_email && (
                      <p dir="ltr" className="truncate font-mono text-xs text-text-tertiary">
                        {grant.user_email}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {t('grantedOn', {
                        when: new Date(grant.granted_at).toLocaleDateString(locale),
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevokeTarget(grant)}
                  className="shrink-0"
                >
                  <Trash2 className="me-1.5 h-3.5 w-3.5" />
                  {t('revokeCta')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Grant dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={grantDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setGrantDialogOpen(false);
            setSelectedStaff(null);
            setStaffQuery('');
            setStaffResults([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('grant.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('grant.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedStaff ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-secondary/40 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                  <UserCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {selectedStaff.first_name} {selectedStaff.last_name}
                  </p>
                  {selectedStaff.email && (
                    <p dir="ltr" className="truncate font-mono text-xs text-text-tertiary">
                      {selectedStaff.email}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStaff(null)}
                >
                  {t('grant.change')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t('grant.staffLabel')}</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    value={staffQuery}
                    onChange={(e) => setStaffQuery(e.target.value)}
                    placeholder={t('grant.staffPlaceholder')}
                    className="ps-10"
                    autoComplete="off"
                  />
                </div>
                {staffQuery.trim().length >= 2 && staffResults.length > 0 && (
                  <ul className="max-h-48 divide-y divide-border/50 overflow-y-auto rounded-xl border border-border bg-surface-secondary/30">
                    {staffResults.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStaff(s);
                            setStaffQuery('');
                            setStaffResults([]);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-surface"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                            <UserCircle className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text-primary">
                              {s.first_name} {s.last_name}
                            </span>
                            {s.email && (
                              <span
                                dir="ltr"
                                className="block truncate font-mono text-[11px] text-text-tertiary"
                              >
                                {s.email}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setGrantDialogOpen(false)}
              disabled={granting}
            >
              {t('grant.cancel')}
            </Button>
            <Button type="button" onClick={handleGrant} disabled={granting || !selectedStaff}>
              <UserPlus className="me-1.5 h-3.5 w-3.5" />
              {granting ? t('grant.granting') : t('grant.confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revoke.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('revoke.dialogDescription', {
                name: revokeTarget?.user_name ?? t('anonymousUser'),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">{t('revoke.reasonLabel')}</Label>
            <Textarea
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder={t('revoke.reasonPlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
            >
              {t('revoke.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || !revokeReason.trim()}
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" />
              {revoking ? t('revoke.revoking') : t('revoke.confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
