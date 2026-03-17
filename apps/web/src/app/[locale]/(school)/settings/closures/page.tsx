'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, toast } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ClosureForm } from './_components/closure-form';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClosureRow {
  id: string;
  date: string;
  reason: string;
  scope: string;
  entity_name?: string;
  created_by_name?: string;
}

interface ClosuresResponse {
  data: ClosureRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClosuresPage() {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<ClosureRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);

  const fetchClosures = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<ClosuresResponse>(`/api/v1/school-closures?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchClosures(page);
  }, [page, fetchClosures]);

  const handleDelete = async (closure: ClosureRow) => {
    try {
      await apiClient(`/api/v1/school-closures/${closure.id}`, { method: 'DELETE' });
      toast.success('Closure deleted');
      void fetchClosures(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const scopeLabel = (scope: string, entityName?: string) => {
    if (scope === 'all') return t('scopeAll');
    return entityName ?? scope;
  };

  const columns = [
    {
      key: 'date',
      header: t('closureDate'),
      render: (row: ClosureRow) => (
        <span className="font-medium font-mono text-text-primary text-xs">{row.date}</span>
      ),
    },
    {
      key: 'reason',
      header: t('reason'),
      render: (row: ClosureRow) => (
        <span className="text-text-secondary">{row.reason}</span>
      ),
    },
    {
      key: 'scope',
      header: t('scope'),
      render: (row: ClosureRow) => (
        <Badge variant="secondary" className="capitalize">{scopeLabel(row.scope, row.entity_name)}</Badge>
      ),
    },
    {
      key: 'created_by',
      header: 'Created By',
      render: (row: ClosureRow) => (
        <span className="text-text-tertiary text-xs">{row.created_by_name ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: ClosureRow) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); void handleDelete(row); }}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('closures')}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createClosure')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <ClosureForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => void fetchClosures(page)}
      />
    </div>
  );
}
