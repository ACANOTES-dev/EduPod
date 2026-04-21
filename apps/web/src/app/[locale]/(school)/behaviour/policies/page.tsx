'use client';

import { Check, Plus, Settings2, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  category_id: string | null;
  category_name: string | null;
  created_at: string;
  updated_at: string;
}

interface PoliciesResponse {
  data: PolicyRule[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourPoliciesPage() {
  const t = useTranslations('behaviour.policies');
  const [rules, setRules] = React.useState<PolicyRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient<PoliciesResponse>(
        '/api/v1/behaviour/policies?page=1&pageSize=100',
        { silent: true },
      );
      setRules(res.data ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourPoliciesPage]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (rule: PolicyRule) => {
    setBusyId(rule.id);
    try {
      await apiClient(`/api/v1/behaviour/policies/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)),
      );
    } catch (err) {
      console.error('[BehaviourPoliciesToggle]', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href="/settings/behaviour-policies">
            <Button variant="outline" size="sm">
              <Settings2 className="me-1.5 h-4 w-4" />
              {t('manage')}
            </Button>
          </Link>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
          <p className="text-sm text-text-primary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <Settings2 className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('empty')}</p>
          <Link href="/settings/behaviour-policies" className="text-xs text-primary-600 underline">
            <span className="mt-2 inline-flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {t('addRule')}
            </span>
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rules.map((rule) => (
            <article key={rule.id} className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-text-primary">{rule.name}</h2>
                  <Badge variant={rule.is_active ? 'success' : 'secondary'}>
                    {rule.is_active ? t('active') : t('inactive')}
                  </Badge>
                  {rule.category_name && <Badge variant="info">{rule.category_name}</Badge>}
                  <span className="text-xs text-text-tertiary">
                    {t('priority')} {rule.priority}
                  </span>
                </div>
                {rule.description && (
                  <p className="mt-1 text-xs text-text-secondary">{rule.description}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleToggle(rule)}
                disabled={busyId === rule.id}
              >
                {rule.is_active ? (
                  <>
                    <X className="me-1.5 h-4 w-4" />
                    {t('disable')}
                  </>
                ) : (
                  <>
                    <Check className="me-1.5 h-4 w-4" />
                    {t('enable')}
                  </>
                )}
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
