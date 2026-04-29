'use client';

import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, Switch, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { LOCALE_REGISTRY } from '../../../../../../../../i18n/registry';

interface TenantLocaleDetail {
  id: string;
  name: string;
  slug: string;
  default_locale: string;
  supported_locales: string[];
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const message = (err as { error?: { message?: string } }).error?.message;
    if (message) return message;
  }
  return fallback;
}

export default function TenantLocalesPage() {
  const params = useParams();
  const tenantId = params?.id as string;

  const [tenant, setTenant] = React.useState<TenantLocaleDetail | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const loadTenant = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<TenantLocaleDetail>(`/api/v1/admin/tenants/${tenantId}`);
      setTenant(result);
      setSelected(new Set(result.supported_locales));
    } catch (err) {
      console.error('[TenantLocalesPage]', err);
      toast.error(getErrorMessage(err, 'Failed to load tenant languages.'));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const toggleLocale = React.useCallback(
    (code: string, enabled: boolean) => {
      setSelected((current) => {
        const next = new Set(current);
        if (enabled) {
          next.add(code);
        } else if (tenant?.default_locale !== code) {
          next.delete(code);
        }
        return next;
      });
    },
    [tenant?.default_locale],
  );

  async function save() {
    if (!tenant) return;
    try {
      setSaving(true);
      const supported_locales = LOCALE_REGISTRY.map((entry) => entry.code).filter((code) =>
        selected.has(code),
      );
      const updated = await apiClient<TenantLocaleDetail>(
        `/api/v1/admin/tenants/${tenant.id}/supported-locales`,
        {
          method: 'PATCH',
          body: JSON.stringify({ supported_locales }),
        },
      );
      setTenant({ ...tenant, supported_locales: updated.supported_locales });
      setSelected(new Set(updated.supported_locales));
      toast.success('Supported languages updated.');
    } catch (err) {
      console.error('[TenantLocalesPage.save]', err);
      toast.error(getErrorMessage(err, 'Could not update supported languages.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-secondary" />
        <div className="h-8 w-64 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-lg bg-surface-secondary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <Link
          href="/en/admin/tenants"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Link>
        <p className="text-sm text-danger-text">Tenant not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/en/admin/tenants/${tenant.id}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {tenant.name}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Supported Languages" description={tenant.name} />
        <Button onClick={save} disabled={saving || selected.size === 0}>
          {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {LOCALE_REGISTRY.map((entry, index) => {
          const enabled = selected.has(entry.code);
          const isDefault = tenant.default_locale === entry.code;
          return (
            <div
              key={entry.code}
              className={[
                'flex items-center justify-between gap-4 px-4 py-3',
                index > 0 ? 'border-t border-border' : '',
              ].join(' ')}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-text-primary">{entry.englishName}</p>
                  <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs uppercase text-text-secondary">
                    {entry.code}
                  </span>
                  {isDefault && (
                    <span className="rounded bg-primary-50 px-1.5 py-0.5 text-xs text-primary-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-secondary">{entry.nativeName}</p>
              </div>
              <div className="flex items-center gap-3">
                {entry.active ? (
                  <Check className="h-4 w-4 text-success-text" aria-label="Active" />
                ) : (
                  <X className="h-4 w-4 text-text-tertiary" aria-label="Registered only" />
                )}
                <Switch
                  checked={enabled}
                  disabled={isDefault}
                  onCheckedChange={(checked) => toggleLocale(entry.code, checked)}
                  aria-label={`Enable ${entry.englishName}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
