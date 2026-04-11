'use client';

import { ArrowLeft, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { AudienceDefinition } from '@school/shared/inbox';
import { Badge, Button, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';

import { AudienceForm, type AudienceFormInitialValues } from '../_components/audience-form';
import {
  isDynamicDefinition,
  isStaticDefinition,
  type AudienceResolutionResult,
  type ProviderInfo,
  type SavedAudienceRow,
} from '../_components/types';

interface ProvidersResponse {
  providers: ProviderInfo[];
}

const RESOLVE_PAGE_SIZE = 50;

export default function SavedAudienceDetailPage() {
  const t = useTranslations('inbox.audiences');
  const tErrors = useTranslations('inbox.audiences.errors');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [row, setRow] = React.useState<SavedAudienceRow | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = React.useState(true);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  const [resolved, setResolved] = React.useState<AudienceResolutionResult | null>(null);
  const [resolveLoading, setResolveLoading] = React.useState(false);
  const [resolvePage, setResolvePage] = React.useState(1);

  const fetchRow = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setNotFound(false);
    try {
      const res = await apiClient<SavedAudienceRow | { data: SavedAudienceRow }>(
        `/api/v1/inbox/audiences/${id}`,
        { silent: true },
      );
      setRow(unwrap<SavedAudienceRow>(res));
    } catch (err) {
      console.error('[SavedAudienceDetailPage.fetch]', err);
      const status = (err as { statusCode?: number; status?: number })?.statusCode;
      if (status === 404) setNotFound(true);
      else toast.error(tErrors('generic'));
    } finally {
      setIsLoading(false);
    }
  }, [id, tErrors]);

  React.useEffect(() => {
    void fetchRow();
  }, [fetchRow]);

  React.useEffect(() => {
    let cancelled = false;
    apiClient<ProvidersResponse | { data: ProvidersResponse }>(
      '/api/v1/inbox/audiences/providers',
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setProviders(unwrap<ProvidersResponse>(res).providers ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[SavedAudienceDetailPage.providers]', err);
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveNow = async () => {
    if (!id) return;
    setResolveLoading(true);
    try {
      const res = await apiClient<AudienceResolutionResult | { data: AudienceResolutionResult }>(
        `/api/v1/inbox/audiences/${id}/resolve`,
        { silent: true },
      );
      setResolved(unwrap<AudienceResolutionResult>(res));
      setResolvePage(1);
    } catch (err) {
      console.error('[SavedAudienceDetailPage.resolve]', err);
      const code = (err as { error?: { code?: string } })?.error?.code;
      if (code === 'SAVED_AUDIENCE_CYCLE_DETECTED') {
        toast.error(tErrors('cycleDetected'));
      } else {
        toast.error(tErrors('resolveFailed'));
      }
    } finally {
      setResolveLoading(false);
    }
  };

  const handleSubmit = async (payload: {
    name: string;
    description: string | null;
    kind: 'static' | 'dynamic';
    definition: AudienceDefinition | { user_ids: string[] };
  }): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!id || !row) return { ok: false, error: tErrors('generic') };
    try {
      const updatePayload: Record<string, unknown> = {
        name: payload.name,
        description: payload.description,
        definition: payload.definition,
      };
      const res = await apiClient<SavedAudienceRow | { data: SavedAudienceRow }>(
        `/api/v1/inbox/audiences/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updatePayload),
          silent: true,
        },
      );
      setRow(unwrap<SavedAudienceRow>(res));
      setResolved(null);
      toast.success(t('toast.saved'));
      return { ok: true };
    } catch (err) {
      console.error('[SavedAudienceDetailPage.submit]', err);
      const code = (err as { error?: { code?: string } })?.error?.code;
      if (code === 'SAVED_AUDIENCE_NAME_TAKEN') {
        return { ok: false, error: tErrors('nameTaken') };
      }
      if (code === 'SAVED_AUDIENCE_CYCLE_DETECTED') {
        return { ok: false, error: tErrors('cycleDetected') };
      }
      const message =
        (err as { error?: { message?: string } })?.error?.message ??
        (err as { message?: string })?.message ??
        tErrors('generic');
      return { ok: false, error: message };
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await apiClient<void>(`/api/v1/inbox/audiences/${id}`, { method: 'DELETE' });
      toast.success(t('toast.deleted'));
      router.push('/inbox/audiences');
    } catch (err) {
      console.error('[SavedAudienceDetailPage.delete]', err);
      toast.error(t('toast.deleteFailed'));
    }
  };

  const handleDuplicate = async () => {
    if (!row) return;
    setDuplicating(true);
    try {
      const suffix = ` (${t('duplicateSuffix')})`;
      const payload = {
        name: `${row.name}${suffix}`.slice(0, 255),
        description: row.description,
        kind: row.kind,
        definition: row.definition_json as AudienceDefinition | { user_ids: string[] },
      };
      const res = await apiClient<SavedAudienceRow | { data: SavedAudienceRow }>(
        '/api/v1/inbox/audiences',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      const created = unwrap<SavedAudienceRow>(res);
      toast.success(t('toast.duplicated'));
      router.push(`/inbox/audiences/${created.id}`);
    } catch (err) {
      console.error('[SavedAudienceDetailPage.duplicate]', err);
      toast.error(t('toast.duplicateFailed'));
    } finally {
      setDuplicating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-text-secondary">
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }

  if (notFound || !row) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('notFound.title')} description={t('notFound.body')} />
        <Button variant="outline" onClick={() => router.push('/inbox/audiences')}>
          <ArrowLeft className="me-2 h-4 w-4" />
          {t('actions.back')}
        </Button>
      </div>
    );
  }

  const initialValues: AudienceFormInitialValues = {
    name: row.name,
    description: row.description,
    kind: row.kind,
    definition:
      row.kind === 'dynamic' && isDynamicDefinition(row.definition_json)
        ? row.definition_json
        : null,
    userIds:
      row.kind === 'static' && isStaticDefinition(row.definition_json)
        ? row.definition_json.user_ids
        : [],
  };

  const pageCount = resolved ? Math.ceil(resolved.user_ids.length / RESOLVE_PAGE_SIZE) : 0;
  const pageStart = (resolvePage - 1) * RESOLVE_PAGE_SIZE;
  const pageSlice = resolved
    ? resolved.user_ids.slice(pageStart, pageStart + RESOLVE_PAGE_SIZE)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.name}
        description={row.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={row.kind === 'dynamic' ? 'info' : 'secondary'}>
              {t(`kind.${row.kind}`)}
            </Badge>
            <Button variant="ghost" onClick={() => router.push('/inbox/audiences')}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {t('actions.back')}
            </Button>
            <Button variant="outline" onClick={handleDuplicate} disabled={duplicating}>
              <Copy className="me-2 h-4 w-4" />
              {t('actions.duplicate')}
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="me-2 h-4 w-4" />
              {t('actions.delete')}
            </Button>
          </div>
        }
      />

      <AudienceForm
        initialValues={initialValues}
        lockKind
        submitLabel={t('actions.save')}
        onSubmit={handleSubmit}
        providers={providers}
        providersLoading={providersLoading}
      />

      {row.kind === 'dynamic' && (
        <section className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{t('resolveNow.title')}</h2>
              <p className="text-xs text-text-secondary">{t('resolveNow.description')}</p>
            </div>
            <Button variant="outline" onClick={resolveNow} disabled={resolveLoading}>
              {resolveLoading ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="me-2 h-4 w-4" />
              )}
              {t('resolveNow.run')}
            </Button>
          </div>

          {resolved && (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                {t('resolveNow.resolvedAt', {
                  at: new Date(resolved.resolved_at).toLocaleString(),
                })}
              </p>
              <p className="text-sm font-medium text-text-primary">
                {t('resolveNow.totalCount', { count: resolved.user_ids.length })}
              </p>

              {resolved.user_ids.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-secondary uppercase tracking-wide text-text-secondary">
                      <tr>
                        <th className="px-3 py-2 text-start font-medium">
                          {t('resolveNow.columns.userId')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {pageSlice.map((userId) => (
                        <tr key={userId}>
                          <td className="px-3 py-1.5 text-text-secondary">{userId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pageCount > 1 && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResolvePage((p) => Math.max(1, p - 1))}
                    disabled={resolvePage === 1}
                  >
                    {t('resolveNow.prev')}
                  </Button>
                  <span className="text-xs text-text-secondary">
                    {t('resolveNow.pageIndicator', {
                      page: resolvePage,
                      total: pageCount,
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResolvePage((p) => Math.min(pageCount, p + 1))}
                    disabled={resolvePage === pageCount}
                  >
                    {t('resolveNow.next')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('delete.confirm.title')}
        description={t('delete.confirm.body')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
