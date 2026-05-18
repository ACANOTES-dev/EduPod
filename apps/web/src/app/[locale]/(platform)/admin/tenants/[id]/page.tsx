'use client';

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { MODULE_REGISTRY, type ModuleKey } from '@school/shared/modules';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { ExplainButton, RecommendFixButton } from '@/components/platform/explain-button';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { AuditActionsTable } from '../../_components/audit-actions-table';
import { SupportActionsPanel } from '../../_components/support-actions-panel';

import { AnalyticsTab } from './_components/analytics-tab';
import { ErrorsTab } from './_components/errors-tab';
import { OnboardingTracker } from './_components/onboarding-tracker';

// ---------- Types ----------

interface TenantDomain {
  id: string;
  domain: string;
  domain_type: 'app' | 'public_site';
  is_primary: boolean;
}

interface TenantModule {
  id: string;
  module_key: string;
  is_enabled: boolean;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  default_locale: string;
  supported_locales: string[];
  timezone: string;
  date_format: string;
  currency_code: string;
  academic_year_start_month: number;
  created_at: string;
  updated_at: string;
  domains: TenantDomain[];
  modules: TenantModule[];
  owner_user: {
    email: string;
    first_name: string;
    global_status: string;
    id: string;
    last_name: string;
  } | null;
}

type TabKey = 'overview' | 'domains' | 'modules' | 'onboarding' | 'analytics' | 'errors';

const statusVariantMap: Record<TenantDetail['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
};

const statusLabelMap: Record<TenantDetail['status'], string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

// ---------- Main Page ----------

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.id as string;
  const locale = (params?.locale as string) ?? 'en';

  const [tenant, setTenant] = React.useState<TenantDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');

  const fetchTenant = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient<TenantDetail>(`/api/v1/admin/tenants/${tenantId}`);
      setTenant(result);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String(
              (err as { error: { message?: string } }).error?.message ?? 'Failed to load tenant',
            )
          : 'Failed to load tenant';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void fetchTenant();
  }, [fetchTenant]);

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-4 h-6 w-32" />
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href={`/${locale}/admin/tenants`}
            className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tenants
          </Link>
        </div>
        <div className="rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error ?? 'Tenant not found'}
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] =
    [
      { key: 'overview', label: 'Overview', icon: Settings },
      { key: 'domains', label: 'Domains', icon: Globe },
      { key: 'modules', label: 'Modules', icon: Settings },
      { key: 'onboarding', label: 'Onboarding', icon: ClipboardCheck },
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
      { key: 'errors', label: 'Errors', icon: AlertTriangle },
    ];

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/${locale}/admin/tenants`}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PageHeader title={tenant.name} />
          <StatusBadge status={statusVariantMap[tenant.status]} dot>
            {statusLabelMap[tenant.status]}
          </StatusBadge>
        </div>
        <TenantActions
          locale={locale}
          tenant={tenant}
          onUpdate={fetchTenant}
          onArchived={() => router.push(`/${locale}/admin/tenants`)}
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary-700 text-primary-700'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab tenant={tenant} onUpdate={fetchTenant} />}
        {activeTab === 'domains' && <DomainsTab tenant={tenant} onUpdate={fetchTenant} />}
        {activeTab === 'modules' && <ModulesTab tenant={tenant} onUpdate={fetchTenant} />}
        {activeTab === 'onboarding' && <OnboardingTracker tenantId={tenant.id} />}
        {activeTab === 'analytics' && <AnalyticsTab tenantId={tenant.id} />}
        {activeTab === 'errors' && (
          <ErrorsTab locale={locale} tenantId={tenant.id} tenantName={tenant.name} />
        )}
      </div>

      <div className="mt-6 grid gap-6">
        {tenant.owner_user ? (
          <SupportActionsPanel
            isOwner
            onActionComplete={fetchTenant}
            tenantId={tenant.id}
            tenantName={tenant.name}
            userEmail={tenant.owner_user.email}
            userId={tenant.owner_user.id}
            userStatus={tenant.owner_user.global_status}
          />
        ) : (
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary">Support actions</h2>
            <p className="mt-2 text-sm text-text-secondary">
              No current school owner was found for this tenant.
            </p>
          </section>
        )}
        <AuditActionsTable targetTenantId={tenant.id} />
      </div>
    </div>
  );
}

// ---------- Tenant Actions ----------

function TenantActions({
  locale,
  tenant,
  onUpdate,
  onArchived,
}: {
  locale: string;
  tenant: TenantDetail;
  onUpdate: () => Promise<void>;
  onArchived: () => void;
}) {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const performAction = async (action: 'suspend' | 'reactivate' | 'archive') => {
    try {
      setActionLoading(action);
      await apiClient(`/api/v1/admin/tenants/${tenant.id}/${action}`, {
        method: 'POST',
      });
      if (action === 'archive') {
        onArchived();
      } else {
        await onUpdate();
      }
      toast.success(
        action === 'reactivate'
          ? 'Tenant reactivated.'
          : action === 'suspend'
            ? 'Tenant suspended.'
            : 'Tenant archived.',
      );
    } catch (err: unknown) {
      console.error('[onUpdate]', err);
      toast.error(getApiErrorMessage(err, `Failed to ${action} tenant.`));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <ExplainButton
        contextId={tenant.id}
        contextKind="tenant"
        label="Explain Tenant"
        locale={locale}
        question={`Explain tenant ${tenant.name}. Summarize tenant modules, recent errors, audit context, health signals, and cited evidence only.`}
      />
      <RecommendFixButton
        contextId={tenant.id}
        contextKind="tenant"
        label="Recommend Fix"
        locale={locale}
      />
      {tenant.status === 'active' && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${locale}/admin/tenants/${tenant.id}/locales`}>
            <Globe className="me-1.5 h-3.5 w-3.5" />
            Languages
          </Link>
        </Button>
      )}
      <Button variant="outline" size="sm" asChild>
        <Link href={`/${locale}/admin/tenants/${tenant.id}/modules`}>
          <Settings className="me-1.5 h-3.5 w-3.5" />
          Module toggles
        </Link>
      </Button>
      {tenant.status === 'active' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => performAction('suspend')}
          disabled={!!actionLoading}
        >
          {actionLoading === 'suspend' && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
          Suspend
        </Button>
      )}
      {tenant.status === 'suspended' && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => performAction('reactivate')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'reactivate' && (
              <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Reactivate
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => performAction('archive')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'archive' && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
            Archive
          </Button>
        </>
      )}
    </div>
  );
}

// ---------- Overview Tab ----------

function OverviewTab({ tenant, onUpdate }: { tenant: TenantDetail; onUpdate: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: tenant.name,
    default_locale: tenant.default_locale,
    timezone: tenant.timezone,
    date_format: tenant.date_format,
    currency_code: tenant.currency_code,
    academic_year_start_month: String(tenant.academic_year_start_month),
  });

  React.useEffect(() => {
    setForm({
      name: tenant.name,
      default_locale: tenant.default_locale,
      timezone: tenant.timezone,
      date_format: tenant.date_format,
      currency_code: tenant.currency_code,
      academic_year_start_month: String(tenant.academic_year_start_month),
    });
  }, [tenant]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      await apiClient(`/api/v1/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          default_locale: form.default_locale,
          timezone: form.timezone,
          date_format: form.date_format,
          currency_code: form.currency_code,
          academic_year_start_month: Number(form.academic_year_start_month),
        }),
      });
      setEditing(false);
      onUpdate();
      toast.success('Tenant updated.');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String(
              (err as { error: { message?: string } }).error?.message ?? 'Failed to update tenant',
            )
          : 'Failed to update tenant';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Tenant Information</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="me-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoField label="Name" value={tenant.name} />
          <InfoField label="Slug" value={tenant.slug} mono />
          <InfoField
            label="Default Language"
            value={tenant.default_locale === 'ar' ? 'Arabic' : 'English'}
          />
          <InfoField label="Timezone" value={tenant.timezone} />
          <InfoField label="Date Format" value={tenant.date_format} />
          <InfoField label="Currency" value={tenant.currency_code} />
          <InfoField
            label="Academic Year Start"
            value={new Date(2024, tenant.academic_year_start_month - 1).toLocaleString('en', {
              month: 'long',
            })}
          />
          <InfoField label="Created" value={formatDate(tenant.created_at)} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-sm font-semibold text-text-primary">Edit Tenant Information</h3>

      {saveError && (
        <div className="mt-4 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {saveError}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name</Label>
          <Input
            id="edit-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Slug</Label>
          <Input value={tenant.slug} disabled />
          <p className="text-xs text-text-tertiary">Slug cannot be changed after creation</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-locale">Default Language</Label>
          <Select
            value={form.default_locale}
            onValueChange={(v) => setForm((f) => ({ ...f, default_locale: v }))}
          >
            <SelectTrigger id="edit-locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">Arabic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-timezone">Timezone</Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          >
            <SelectTrigger id="edit-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                'Asia/Riyadh',
                'Asia/Dubai',
                'Asia/Kuwait',
                'Asia/Bahrain',
                'Asia/Qatar',
                'Asia/Muscat',
                'Africa/Cairo',
                'Europe/London',
                'America/New_York',
                'America/Chicago',
                'America/Los_Angeles',
                'UTC',
              ].map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-date-format">Date Format</Label>
          <Select
            value={form.date_format}
            onValueChange={(v) => setForm((f) => ({ ...f, date_format: v }))}
          >
            <SelectTrigger id="edit-date-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-currency">Currency</Label>
          <Select
            value={form.currency_code}
            onValueChange={(v) => setForm((f) => ({ ...f, currency_code: v }))}
          >
            <SelectTrigger id="edit-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { code: 'SAR', label: 'SAR — Saudi Riyal' },
                { code: 'AED', label: 'AED — UAE Dirham' },
                { code: 'KWD', label: 'KWD — Kuwaiti Dinar' },
                { code: 'BHD', label: 'BHD — Bahraini Dinar' },
                { code: 'QAR', label: 'QAR — Qatari Riyal' },
                { code: 'OMR', label: 'OMR — Omani Rial' },
                { code: 'EGP', label: 'EGP — Egyptian Pound' },
                { code: 'GBP', label: 'GBP — British Pound' },
                { code: 'USD', label: 'USD — US Dollar' },
              ].map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-academic-month">Academic Year Start</Label>
          <Select
            value={form.academic_year_start_month}
            onValueChange={(v) => setForm((f) => ({ ...f, academic_year_start_month: v }))}
          >
            <SelectTrigger id="edit-academic-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: new Date(2024, i).toLocaleString('en', { month: 'long' }),
              })).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
        <Button variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className={`mt-0.5 text-sm text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

// ---------- Domains Tab ----------

function DomainsTab({ tenant, onUpdate }: { tenant: TenantDetail; onUpdate: () => void }) {
  const [newDomain, setNewDomain] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    try {
      setAdding(true);
      setError(null);
      await apiClient(`/api/v1/admin/tenants/${tenant.id}/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain: newDomain.trim(), domain_type: 'app' }),
      });
      setNewDomain('');
      onUpdate();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String(
              (err as { error: { message?: string } }).error?.message ?? 'Failed to add domain',
            )
          : 'Failed to add domain';
      setError(message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domainId: string) => {
    try {
      setRemovingId(domainId);
      setError(null);
      await apiClient(`/api/v1/admin/tenants/${tenant.id}/domains/${domainId}`, {
        method: 'DELETE',
      });
      onUpdate();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String(
              (err as { error: { message?: string } }).error?.message ?? 'Failed to remove domain',
            )
          : 'Failed to remove domain';
      setError(message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add domain form */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h3 className="text-sm font-semibold text-text-primary">Add Domain</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Map a custom domain to this tenant for access
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}

        <form onSubmit={handleAdd} className="mt-4 flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-domain">Domain</Label>
            <Input
              id="new-domain"
              placeholder="e.g. app.schoolname.edu"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={adding || !newDomain.trim()}>
            {adding ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="me-2 h-4 w-4" />
            )}
            Add
          </Button>
        </form>
      </div>

      {/* Domain list */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Configured Domains ({tenant.domains.length})
          </h3>
        </div>
        {tenant.domains.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Globe className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-2 text-sm text-text-tertiary">No domains configured</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tenant.domains.map((domain) => (
              <div key={domain.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-text-tertiary" />
                  <span className="text-sm font-medium text-text-primary">{domain.domain}</span>
                  {domain.is_primary && <StatusBadge status="info">Primary</StatusBadge>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(domain.id)}
                  disabled={removingId === domain.id}
                  aria-label={`Remove ${domain.domain}`}
                >
                  {removingId === domain.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-text-tertiary hover:text-danger-text" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Modules Tab ----------

function ModulesTab({ tenant, onUpdate }: { tenant: TenantDetail; onUpdate: () => void }) {
  const [togglingKey, setTogglingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const moduleRowsByKey = React.useMemo(() => {
    return new Map(tenant.modules.map((moduleRow) => [moduleRow.module_key, moduleRow]));
  }, [tenant.modules]);

  const handleToggle = async (moduleKey: ModuleKey, enabled: boolean) => {
    try {
      setTogglingKey(moduleKey);
      setError(null);
      await apiClient(`/api/v1/admin/tenants/${tenant.id}/modules/${moduleKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: enabled }),
      });
      onUpdate();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String(
              (err as { error: { message?: string } }).error?.message ?? 'Failed to update module',
            )
          : 'Failed to update module';
      setError(message);
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-text-primary">Module Configuration</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Enable or disable modules for this tenant
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      <div className="divide-y divide-border">
        {MODULE_REGISTRY.map((moduleDefinition) => {
          const row = moduleRowsByKey.get(moduleDefinition.key);
          return (
            <div key={moduleDefinition.key} className="flex items-center justify-between px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {moduleDefinition.display_name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-secondary">
                  {moduleDefinition.key}
                </p>
                {!row ? (
                  <p className="mt-1 text-xs text-warning-text">
                    Missing row; toggling will recreate it.
                  </p>
                ) : null}
              </div>
              <Switch
                checked={row?.is_enabled ?? false}
                onCheckedChange={(checked) => handleToggle(moduleDefinition.key, checked)}
                disabled={togglingKey === moduleDefinition.key}
                aria-label={`Toggle ${moduleDefinition.display_name}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const message = (err as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
