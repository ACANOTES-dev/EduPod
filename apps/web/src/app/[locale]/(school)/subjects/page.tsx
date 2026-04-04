'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Switch,
} from '@school/ui';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { SubjectForm, type SubjectFormValues } from './_components/subject-form';


// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  name: string;
  code: string | null;
  subject_type: string;
  active: boolean;
}

interface SubjectsResponse {
  data: Subject[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubjectsPage() {
  const t = useTranslations('subjects');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<Subject[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [typeFilter, setTypeFilter] = React.useState('all');
  const [activeFilter, setActiveFilter] = React.useState('all');

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Subject | null>(null);

  const fetchSubjects = React.useCallback(async (p: number, type: string, active: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (type !== 'all') params.set('subject_type', type);
      if (active !== 'all') params.set('active', active);
      const res = await apiClient<SubjectsResponse>(`/api/v1/subjects?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[SubjectsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSubjects(page, typeFilter, activeFilter);
  }, [page, typeFilter, activeFilter, fetchSubjects]);

  const handleCreate = async (values: SubjectFormValues) => {
    await apiClient('/api/v1/subjects', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name,
        code: values.code || undefined,
        subject_type: values.subject_type,
        active: values.active,
      }),
    });
    void fetchSubjects(page, typeFilter, activeFilter);
  };

  const handleUpdate = async (values: SubjectFormValues) => {
    if (!editTarget) return;
    await apiClient(`/api/v1/subjects/${editTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: values.name,
        code: values.code || undefined,
        subject_type: values.subject_type,
        active: values.active,
      }),
    });
    void fetchSubjects(page, typeFilter, activeFilter);
  };

  const handleToggleActive = async (subject: Subject) => {
    try {
      await apiClient(`/api/v1/subjects/${subject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !subject.active }),
      });
      void fetchSubjects(page, typeFilter, activeFilter);
    } catch (err) {
      // silently fail
      console.error('[fetchSubjects]', err);
    }
  };

  const columns = [
    {
      key: 'name',
      header: t('fieldName'),
      render: (row: Subject) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'code',
      header: t('fieldCode'),
      render: (row: Subject) => (
        <span className="font-mono text-text-secondary" dir="ltr">
          {row.code ?? '—'}
        </span>
      ),
    },
    {
      key: 'type',
      header: t('fieldType'),
      render: (row: Subject) => <StatusBadge status="info">{row.subject_type}</StatusBadge>,
    },
    {
      key: 'active',
      header: t('fieldActive'),
      render: (row: Subject) => (
        <Switch
          checked={row.active}
          onCheckedChange={() => handleToggleActive(row)}
          aria-label={t('toggleActive')}
        />
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: Subject) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setEditTarget(row);
          }}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">{tc('edit')}</span>
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('filterType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAllTypes')}</SelectItem>
          <SelectItem value="academic">{t('typeAcademic')}</SelectItem>
          <SelectItem value="supervision">{t('typeSupervision')}</SelectItem>
          <SelectItem value="duty">{t('typeDuty')}</SelectItem>
          <SelectItem value="other">{t('typeOther')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={activeFilter}
        onValueChange={(v) => {
          setActiveFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAll')}</SelectItem>
          <SelectItem value="true">{t('filterActive')}</SelectItem>
          <SelectItem value="false">{t('filterInactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newSubject')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <SubjectForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        title={t('newSubject')}
        submitLabel={t('createSubject')}
      />

      {editTarget && (
        <SubjectForm
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          initialValues={{
            name: editTarget.name,
            code: editTarget.code ?? '',
            subject_type: editTarget.subject_type,
            active: editTarget.active,
          }}
          onSubmit={handleUpdate}
          title={t('editSubject')}
        />
      )}
    </div>
  );
}
