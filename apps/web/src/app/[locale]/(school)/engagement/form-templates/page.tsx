'use client';

import { ClipboardList, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import {
  FORM_TYPE_OPTIONS,
  humanizeStatus,
  type FormTemplateRecord,
  type PaginatedResponse,
} from '../_components/engagement-types';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

export default function EngagementFormTemplatesPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');
  const [templates, setTemplates] = React.useState<FormTemplateRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const fetchTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      if (typeFilter !== 'all') {
        params.set('form_type', typeFilter);
      }

      const response = await apiClient<PaginatedResponse<FormTemplateRecord>>(
        `/api/v1/engagement/form-templates?${params.toString()}`,
      );

      setTemplates(response.data);
      setTotal(response.meta.total);
    } catch (error) {
      console.error('[EngagementFormTemplatesPage.fetchTemplates]', error);
      setTemplates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  React.useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter]);

  const filteredTemplates = React.useMemo(() => {
    if (!search.trim()) {
      return templates;
    }

    const query = search.toLowerCase();
    return templates.filter((template) =>
      `${template.name} ${template.description ?? ''}`.toLowerCase().includes(query),
    );
  }, [search, templates]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.formTemplates.title')}
        description={t('pages.formTemplates.description')}
        actions={
          <Button onClick={() => router.push(`/${locale}/engagement/form-templates/new`)}>
            <Plus className="me-2 h-4 w-4" />
            {t('pages.formTemplates.newTemplate')}
          </Button>
        }
      />

      {!loading && templates.length === 0 && statusFilter === 'all' && typeFilter === 'all' ? (
        <EmptyState
          icon={ClipboardList}
          title={t('pages.formTemplates.emptyTitle')}
          description={t('pages.formTemplates.emptyDescription')}
          action={{
            label: t('pages.formTemplates.newTemplate'),
            onClick: () => router.push(`/${locale}/engagement/form-templates/new`),
          }}
        />
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              header: t('pages.formTemplates.columns.name'),
              render: (row) => (
                <div>
                  <p className="font-medium text-text-primary">{row.name}</p>
                  <p className="text-xs text-text-tertiary">{row.description || '—'}</p>
                </div>
              ),
            },
            {
              key: 'type',
              header: t('pages.formTemplates.columns.type'),
              render: (row) =>
                t(
                  `formTypes.${FORM_TYPE_OPTIONS.find((option) => option.value === row.form_type)?.label ?? 'survey'}`,
                ),
            },
            {
              key: 'status',
              header: t('pages.formTemplates.columns.status'),
              render: (row) => humanizeStatus(row.status),
            },
            {
              key: 'fields',
              header: t('pages.formTemplates.columns.fields'),
              render: (row) => row.fields_json.length,
            },
            {
              key: 'signature',
              header: t('pages.formTemplates.columns.signature'),
              render: (row) =>
                row.requires_signature ? t('shared.required') : t('shared.optional'),
            },
          ]}
          data={filteredTemplates}
          page={page}
          pageSize={20}
          total={search ? filteredTemplates.length : total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => router.push(`/${locale}/engagement/form-templates/${row.id}`)}
          isLoading={loading}
          toolbar={
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('shared.searchTemplates')}
                  className="ps-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('shared.allStatuses')}</SelectItem>
                  <SelectItem value="draft">{t('statuses.draft')}</SelectItem>
                  <SelectItem value="published">{t('statuses.published')}</SelectItem>
                  <SelectItem value="archived">{t('statuses.archived')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('shared.allTypes')}</SelectItem>
                  {FORM_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`formTypes.${option.label}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      )}
    </div>
  );
}
