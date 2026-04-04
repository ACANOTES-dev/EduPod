'use client';

import { Download, Eye, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentRow {
  id: string;
  document_type: string;
  status: string;
  generated_at: string;
  student: { first_name: string; last_name: string } | null;
  generated_by_user: { first_name: string; last_name: string } | null;
  download_url: string | null;
}

interface DocumentsResponse {
  data: DocumentRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface GenerateForm {
  entity_type: string;
  entity_id: string;
  document_type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  'incident_notice',
  'sanction_letter',
  'parent_notification',
  'suspension_letter',
  'exclusion_letter',
  'reinstatement_letter',
  'behaviour_report',
  'contact_pack',
] as const;

const STATUS_CONFIG: Record<string, { className: string }> = {
  draft: {
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  finalised: {
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  sent: {
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  superseded: {
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

const ENTITY_TYPE_OPTIONS = ['incident', 'sanction', 'student'] as const;

const DEFAULT_GENERATE_FORM: GenerateForm = {
  entity_type: 'incident',
  entity_id: '',
  document_type: 'incident_notice',
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function DocumentStatusBadge({ status }: { status: string }) {
  const t = useTranslations('behaviour.documents');
  const config = STATUS_CONFIG[status] ?? {
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {t(`documentStatuses.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const t = useTranslations('behaviour.documents');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<DocumentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [docTypeFilter, setDocTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [studentSearch, setStudentSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [generateForm, setGenerateForm] = React.useState<GenerateForm>(DEFAULT_GENERATE_FORM);
  const [generating, setGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState('');

  const isMobile = useIsMobile();

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(studentSearch);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [studentSearch]);

  // Fetch documents
  const fetchDocuments = React.useCallback(
    async (p: number, docType: string, status: string, search: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (docType !== 'all') params.set('document_type', docType);
        if (status !== 'all') params.set('status', status);
        if (search) params.set('student_search', search);
        const res = await apiClient<DocumentsResponse>(
          `/api/v1/behaviour/documents?${params.toString()}`,
        );
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (error: unknown) {
        console.error('[DocumentsPage.fetchDocuments]', error);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchDocuments(page, docTypeFilter, statusFilter, debouncedSearch);
  }, [page, docTypeFilter, statusFilter, debouncedSearch, fetchDocuments]);

  // Generate document handler
  const handleGenerate = async () => {
    if (!generateForm.entity_id.trim()) {
      setGenerateError(t('generateDialog.entityIdRequired'));
      return;
    }
    setGenerating(true);
    setGenerateError('');
    try {
      await apiClient('/api/v1/behaviour/documents', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: generateForm.entity_type,
          entity_id: generateForm.entity_id.trim(),
          document_type: generateForm.document_type,
        }),
      });
      setGenerateOpen(false);
      setGenerateForm(DEFAULT_GENERATE_FORM);
      void fetchDocuments(1, docTypeFilter, statusFilter, debouncedSearch);
      setPage(1);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setGenerateError(ex?.error?.message ?? t('generateDialog.errorGeneric'));
    } finally {
      setGenerating(false);
    }
  };

  const updateForm = <K extends keyof GenerateForm>(key: K, value: GenerateForm[K]) => {
    setGenerateForm((prev) => ({ ...prev, [key]: value }));
  };

  // ─── DataTable columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'student',
      header: t('columns.student'),
      render: (row: DocumentRow) => (
        <span className="text-sm font-medium text-text-primary">
          {row.student ? `${row.student.first_name} ${row.student.last_name}` : '\u2014'}
        </span>
      ),
    },
    {
      key: 'document_type',
      header: t('columns.documentType'),
      render: (row: DocumentRow) => (
        <span className="text-sm text-text-secondary">
          {t(`documentTypes.${row.document_type}` as Parameters<typeof t>[0])}
        </span>
      ),
    },
    {
      key: 'generated_at',
      header: t('columns.generated'),
      render: (row: DocumentRow) => (
        <span className="font-mono text-xs text-text-primary">{formatDate(row.generated_at)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: DocumentRow) => (
        <div className="flex flex-col gap-1">
          <DocumentStatusBadge status={row.status} />
          {row.status === 'draft' && (
            <span className="text-[10px] font-medium text-amber-600">{t('needsReview')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'generated_by',
      header: t('columns.generatedBy'),
      render: (row: DocumentRow) =>
        row.generated_by_user ? (
          <span className="text-sm text-text-secondary">
            {row.generated_by_user.first_name} {row.generated_by_user.last_name}
          </span>
        ) : (
          <span className="text-text-tertiary">{t('u2014')}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: DocumentRow) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${locale}/behaviour/documents/${row.id}`);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="ms-1 hidden sm:inline">{t('view')}</span>
          </Button>
          {row.download_url && (
            <a
              href={row.download_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="sm">
                <Download className="h-3.5 w-3.5" />
                <span className="ms-1 hidden sm:inline">{t('download')}</span>
              </Button>
            </a>
          )}
        </div>
      ),
    },
  ];

  // ─── Toolbar ────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={studentSearch}
        onChange={(e) => setStudentSearch(e.target.value)}
        placeholder={t('searchStudent')}
        className="w-full text-base sm:w-48 sm:text-sm"
        aria-label={t('searchStudent')}
      />
      <Select
        value={docTypeFilter}
        onValueChange={(v) => {
          setDocTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('filters.documentType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
          {DOCUMENT_TYPES.map((documentType) => (
            <SelectItem key={documentType} value={documentType}>
              {t(`documentTypes.${documentType}` as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
          <SelectItem value="draft">{t('statuses.draft')}</SelectItem>
          <SelectItem value="finalised">{t('statuses.finalised')}</SelectItem>
          <SelectItem value="sent">{t('statuses.sent')}</SelectItem>
          <SelectItem value="superseded">{t('statuses.superseded')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Mobile Card ─────────────────────────────────────────────────────────

  const renderMobileCard = (row: DocumentRow) => (
    <div key={row.id} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {row.student
              ? `${row.student.first_name} ${row.student.last_name}`
              : t('unknownStudent')}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {t(`documentTypes.${row.document_type}` as Parameters<typeof t>[0])}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DocumentStatusBadge status={row.status} />
          {row.status === 'draft' && (
            <span className="text-[10px] font-medium text-amber-600">{t('needsReview')}</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <span>{formatDate(row.generated_at)}</span>
        {row.generated_by_user && (
          <span>
            {row.generated_by_user.first_name} {row.generated_by_user.last_name}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => router.push(`/${locale}/behaviour/documents/${row.id}`)}
        >
          <Eye className="me-1.5 h-3.5 w-3.5" />
          {t('view')}
        </Button>
        {row.download_url && (
          <a href={row.download_url} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Download className="me-1.5 h-3.5 w-3.5" />
              {t('download')}
            </Button>
          </a>
        )}
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            onClick={() => {
              setGenerateError('');
              setGenerateOpen(true);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t('generateDocument')}
          </Button>
        }
      />

      {isMobile ? (
        <div>
          {toolbar}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
              ))
            ) : data.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">{t('noResults')}</p>
            ) : (
              data.map(renderMobileCard)
            )}
          </div>
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>{t('pageOf', { page, total: Math.ceil(total / PAGE_SIZE) })}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/behaviour/documents/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Generate Document Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('generateDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('generateDialog.entityType')}</Label>
              <Select
                value={generateForm.entity_type}
                onValueChange={(v) => updateForm('entity_type', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map((entityType) => (
                    <SelectItem key={entityType} value={entityType}>
                      {t(`entityTypes.${entityType}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('generateDialog.entityId')}</Label>
              <Input
                value={generateForm.entity_id}
                onChange={(e) => updateForm('entity_id', e.target.value)}
                placeholder={t('generateDialog.entityIdPlaceholder')}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('generateDialog.documentType')}</Label>
              <Select
                value={generateForm.document_type}
                onValueChange={(v) => updateForm('document_type', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((documentType) => (
                    <SelectItem key={documentType} value={documentType}>
                      {t(`documentTypes.${documentType}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {generateError && <p className="text-sm text-danger-text">{generateError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
              {t('generateDialog.cancel')}
            </Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? t('generateDialog.generating') : t('generateDialog.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
