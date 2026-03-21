'use client';

import { Badge, Button, toast } from '@school/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ClosureForm } from './_components/closure-form';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClosureRow {
  id: string;
  closure_date: string;
  reason: string;
  affects_scope: string;
  scope_entity_id?: string | null;
  scope_entity_name?: string | null;
  created_by?: { first_name: string; last_name: string } | null;
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
        <span className="font-medium font-mono text-text-primary text-xs">{row.closure_date ? new Date(row.closure_date).toLocaleDateString('en-GB') : '—'}</span>
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
        <Badge variant="secondary" className="capitalize">{scopeLabel(row.affects_scope, row.scope_entity_name ?? row.scope_entity_id ?? undefined)}</Badge>
      ),
    },
    {
      key: 'created_by',
      header: 'Created By',
      render: (row: ClosureRow) => (
        <span className="text-text-tertiary text-xs">{row.created_by ? `${row.created_by.first_name} ${row.created_by.last_name}` : '—'}</span>
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
