'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Input, Label, toast } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import { DnsRecordsTable } from './dns-records-table';

const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, {
      message: 'Enter a valid domain (e.g. school.example)',
    }),
});
type AddDomainForm = z.infer<typeof addDomainSchema>;

interface DnsRecordRow {
  record: 'SPF' | 'DKIM' | 'DMARC';
  type: string;
  name: string;
  value: string;
  status: 'pending' | 'verified' | 'failed';
}

interface DomainRow {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  dns_records: DnsRecordRow[];
  last_checked_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export function DomainVerificationCard() {
  const t = useTranslations('settings.communications.email.domains');
  const [rows, setRows] = React.useState<DomainRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  // Inline error captured from the most recent Add Domain submit. Surfaces
  // verbatim provider rejection (e.g. "Domain already exists in Resend") in
  // a persistent banner under the form so users don't miss the brief toast.
  const [addError, setAddError] = React.useState<string | null>(null);

  const form = useForm<AddDomainForm>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: '' },
  });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // silent:true — handle in catch; the load is not user-initiated and a
      // global toast on initial render is noise (e.g. "permission denied" if
      // the role can't list domains is conveyed by the 404 status above).
      const raw = await apiClient<{ data: DomainRow[] } | DomainRow[]>('/api/v1/email-domains', {
        silent: true,
      });
      setRows(unwrap<DomainRow[]>(raw));
    } catch (err) {
      console.error('[DomainVerificationCard.load]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onAdd = form.handleSubmit(async (values) => {
    setAddError(null);
    try {
      // silent:true so we control surfacing — both as a toast AND as an
      // inline persistent banner under the form (toasts can be missed when
      // the user is reading the form area).
      await apiClient('/api/v1/email-domains', {
        method: 'POST',
        body: JSON.stringify(values),
        silent: true,
      });
      toast.success(t('add.success'));
      form.reset();
      setShowAdd(false);
      await load();
    } catch (err: unknown) {
      const errorObj = err as {
        error?: { message?: string; details?: { provider_error?: string } };
      };
      const message =
        errorObj?.error?.details?.provider_error ?? errorObj?.error?.message ?? t('add.error');
      setAddError(message);
      toast.error(message);
    }
  });

  async function onRefresh(id: string) {
    setRefreshingId(id);
    try {
      const raw = await apiClient<{ data: DomainRow } | DomainRow>(
        `/api/v1/email-domains/${id}/refresh`,
        { method: 'POST', silent: true },
      );
      const updated = unwrap<DomainRow>(raw);
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
      toast.success(t('refresh.success'));
    } catch (err: unknown) {
      const errorObj = err as {
        error?: { message?: string; details?: { provider_error?: string } };
      };
      toast.error(
        errorObj?.error?.details?.provider_error ?? errorObj?.error?.message ?? t('refresh.error'),
      );
    } finally {
      setRefreshingId(null);
    }
  }

  async function onDelete(id: string, domain: string) {
    if (!window.confirm(t('delete.confirm', { domain }))) return;
    try {
      await apiClient(`/api/v1/email-domains/${id}`, { method: 'DELETE', silent: true });
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success(t('delete.success'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('delete.error'));
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{t('description')}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? t('add.cancel') : t('add.button')}
        </Button>
      </header>

      {showAdd && (
        <>
          <form onSubmit={onAdd} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="domain-input">{t('add.domainLabel')}</Label>
              <Input
                id="domain-input"
                type="text"
                dir="ltr"
                placeholder={t('add.domainPlaceholder')}
                className="mt-1 font-mono text-base"
                aria-invalid={form.formState.errors.domain ? true : undefined}
                aria-describedby={form.formState.errors.domain ? 'domain-input-error' : undefined}
                {...form.register('domain')}
              />
              {form.formState.errors.domain && (
                <p id="domain-input-error" role="alert" className="mt-1 text-xs text-destructive">
                  {form.formState.errors.domain.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('add.submitting') : t('add.submit')}
            </Button>
          </form>
          {addError && (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
            >
              <p className="text-sm font-medium text-destructive">{t('add.errorTitle')}</p>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-destructive">
                {addError}
              </pre>
            </div>
          )}
        </>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-text-tertiary">{t('empty')}</p>
        )}
        {!isLoading &&
          rows.map((row) => (
            <DomainRowCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
              onRefresh={() => onRefresh(row.id)}
              onDelete={() => onDelete(row.id, row.domain)}
              refreshing={refreshingId === row.id}
            />
          ))}
      </div>
    </section>
  );
}

function DomainRowCard({
  row,
  expanded,
  onToggle,
  onRefresh,
  onDelete,
  refreshing,
}: {
  row: DomainRow;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations('settings.communications.email.domains');
  const lastChecked = row.last_checked_at ? new Date(row.last_checked_at).toLocaleString() : '—';
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-text-primary" dir="ltr">
            {row.domain}
          </p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {t('lastChecked', { ts: lastChecked })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={row.status} />
          <Button type="button" size="sm" variant="outline" onClick={onToggle}>
            {expanded ? t('hideRecords') : t('viewRecords')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`me-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('refresh.button')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="me-2 h-3.5 w-3.5" />
            {t('delete.button')}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          <DnsRecordsTable records={row.dns_records ?? []} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DomainRow['status'] }) {
  const t = useTranslations('settings.communications.email.domains.status');
  const map: Record<DomainRow['status'], { label: string; className: string }> = {
    pending: { label: t('pending'), className: 'bg-warning-100 text-warning-700' },
    verified: { label: t('verified'), className: 'bg-success-100 text-success-700' },
    failed: { label: t('failed'), className: 'bg-destructive/10 text-destructive' },
  };
  const item = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.className}`}>
      {item.label}
    </span>
  );
}
