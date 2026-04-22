'use client';

import { FileText, Plus, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DescriptionTemplate {
  id: string;
  name: string;
  body: string;
  category_id: string | null;
  is_active: boolean;
  usage_count?: number;
}

interface DocumentTemplate {
  id: string;
  name: string;
  document_type: string;
  locale: string;
  is_active: boolean;
  is_system: boolean;
}

interface ListResponse<T> {
  data: T[];
  meta?: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourTemplatesPage() {
  const t = useTranslations('behaviour.templates');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const [descriptionTemplates, setDescriptionTemplates] = React.useState<DescriptionTemplate[]>([]);
  const [documentTemplates, setDocumentTemplates] = React.useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [descRes, docRes] = await Promise.all([
        apiClient<ListResponse<DescriptionTemplate>>('/api/v1/behaviour/description-templates', {
          silent: true,
        }).catch(() => ({ data: [] as DescriptionTemplate[] })),
        apiClient<ListResponse<DocumentTemplate>>('/api/v1/behaviour/document-templates', {
          silent: true,
        }).catch(() => ({ data: [] as DocumentTemplate[] })),
      ]);
      setDescriptionTemplates(descRes.data ?? []);
      setDocumentTemplates(docRes.data ?? []);
    } catch (err: unknown) {
      console.error('[BehaviourTemplatesPage]', err);
      setLoadError((err as { error?: { message?: string } }).error?.message ?? t('errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const total = descriptionTemplates.length + documentTemplates.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/behaviour`, label: 'Back' }}
        actions={
          <Link href="/settings/behaviour-templates">
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
      ) : total === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('empty')}</p>
          <Link href="/settings/behaviour-templates" className="text-xs text-primary-600 underline">
            <span className="mt-2 inline-flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {t('addTemplate')}
            </span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {descriptionTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                {t('descriptionTemplates')}
              </h2>
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {descriptionTemplates.map((tpl) => (
                  <article key={tpl.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-medium text-text-primary">
                            {tpl.name}
                          </h3>
                          {!tpl.is_active && <Badge variant="secondary">{t('inactive')}</Badge>}
                          {typeof tpl.usage_count === 'number' && (
                            <span className="text-xs text-text-tertiary">
                              {t('usageCount', { count: tpl.usage_count })}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{tpl.body}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {documentTemplates.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                {t('documentTemplates')}
              </h2>
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {documentTemplates.map((tpl) => (
                  <article key={tpl.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-medium text-text-primary">
                            {tpl.name}
                          </h3>
                          <Badge variant="info">{tpl.document_type.replace(/_/g, ' ')}</Badge>
                          <Badge variant="secondary">{tpl.locale.toUpperCase()}</Badge>
                          {tpl.is_system && <Badge variant="secondary">{t('system')}</Badge>}
                          {!tpl.is_active && <Badge variant="secondary">{t('inactive')}</Badge>}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
