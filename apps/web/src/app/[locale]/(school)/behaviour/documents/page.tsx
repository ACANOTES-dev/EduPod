'use client';

import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Plus,
  Send,
  XCircle,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
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
import { formatDateTime } from '@/lib/format-date';

import { DocumentStatusBadge } from './_components/document-status-badge';
import {
  DOCUMENT_ENTITY_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  type DocumentEntityType,
  type DocumentRow,
  type DocumentStatus,
  type DocumentType,
} from './_components/document-types';
import { GenerateDocumentDialog } from './_components/generate-document-dialog';

// ─── Wire types ───────────────────────────────────────────────────────────────

interface DocumentsResponse {
  data: DocumentRow[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

type TypeFilter = DocumentType | 'all';
type StatusFilter = DocumentStatus | 'all';
type EntityFilter = DocumentEntityType | 'all';

export default function BehaviourDocumentsPage() {
  const t = useTranslations('documentGen.list');
  const tTypes = useTranslations('documentGen.types');
  const tActions = useTranslations('documentGen.actions');
  const tStatus = useTranslations('documentGen.status');
  const tEntities = useTranslations('documentGen.entityTypes');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const isMobile = useIsMobile();

  const [rows, setRows] = React.useState<DocumentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [entityFilter, setEntityFilter] = React.useState<EntityFilter>('all');
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  const [generateOpen, setGenerateOpen] = React.useState(false);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchDocuments = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (typeFilter !== 'all') params.set('document_type', typeFilter);
      if (statusFilter !== 'all' && statusFilter !== 'generating') {
        params.set('status', statusFilter);
      }
      if (entityFilter !== 'all') params.set('entity_type', entityFilter);
      const res = await apiClient<DocumentsResponse>(
        `/api/v1/behaviour/documents?${params.toString()}`,
      );
      let data = res.data ?? [];
      // `generating` is a transient state and the backend list filter doesn't
      // expose it (the listDocumentsQuerySchema only accepts public-facing
      // statuses). Keep the filter usable client-side.
      if (statusFilter === 'generating') {
        data = data.filter((doc) => doc.status === 'generating');
      }
      // `debouncedSearch` is a free-text student name filter — the backend
      // doesn't implement it directly, so we filter client-side on the
      // already-paged slice. Sufficient for per-page filtering on today's
      // dataset (≤100 docs per page, one HTTP round-trip).
      if (debouncedSearch) {
        const needle = debouncedSearch.toLowerCase();
        data = data.filter((doc) => {
          const student = doc.student;
          if (!student) return false;
          const full = `${student.first_name} ${student.last_name}`.toLowerCase();
          return full.includes(needle);
        });
      }
      setRows(data);
      setTotal(res.meta?.total ?? 0);
    } catch (err: unknown) {
      console.error('[BehaviourDocumentsPage.fetchDocuments]', err);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, entityFilter, debouncedSearch]);

  React.useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const openDetail = (doc: DocumentRow) => {
    router.push(`/${locale}/behaviour/documents/${doc.id}`);
  };

  const handleGenerated = (doc: DocumentRow) => {
    // After a generation kicks off, jump to the detail page so the user can
    // watch the render state progress. The list refreshes on navigation back.
    router.push(`/${locale}/behaviour/documents/${doc.id}`);
  };

  const handlePreview = async (doc: DocumentRow) => {
    if (doc.status === 'generating') return;
    try {
      const res = await apiClient<{ data: { url: string } }>(
        `/api/v1/behaviour/documents/${doc.id}/preview`,
        { silent: true },
      );
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      console.error('[BehaviourDocumentsPage.handlePreview]', err);
    }
  };

  const handleDownload = async (doc: DocumentRow) => {
    if (doc.status === 'generating') return;
    try {
      const res = await apiClient<{ data: { url: string } }>(
        `/api/v1/behaviour/documents/${doc.id}/download`,
        { silent: true },
      );
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      console.error('[BehaviourDocumentsPage.handleDownload]', err);
    }
  };

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="w-full text-base sm:w-52 sm:text-sm"
        aria-label={t('searchPlaceholder')}
      />
      <Select
        value={typeFilter}
        onValueChange={(value) => {
          setTypeFilter(value as TypeFilter);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder={t('typeFilter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allTypes')}</SelectItem>
          {DOCUMENT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {tTypes(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value as StatusFilter);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('statusFilter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          {DOCUMENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={entityFilter}
        onValueChange={(value) => {
          setEntityFilter(value as EntityFilter);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('entityFilter')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allEntities')}</SelectItem>
          {DOCUMENT_ENTITY_TYPES.map((entity) => (
            <SelectItem key={entity} value={entity}>
              {tEntities(entity)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Columns ──────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'document_type',
      header: t('columns.document'),
      render: (row: DocumentRow) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {tTypes(row.document_type)}
            </p>
            {row.template && (
              <p className="truncate text-xs text-text-tertiary">{row.template.name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'student',
      header: t('columns.student'),
      render: (row: DocumentRow) => (
        <span className="text-sm text-text-primary">
          {row.student ? `${row.student.first_name} ${row.student.last_name}` : '—'}
        </span>
      ),
    },
    {
      key: 'generated_at',
      header: t('columns.generated'),
      render: (row: DocumentRow) => (
        <span className="whitespace-nowrap font-mono text-xs text-text-tertiary">
          {formatDateTime(row.generated_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: DocumentRow) => <DocumentStatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row: DocumentRow) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('openActions')}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onSelect={() => openDetail(row)}>
                <Eye className="me-2 h-4 w-4" />
                {tActions('openDetail')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={row.status === 'generating'}
                onSelect={() => {
                  void handlePreview(row);
                }}
              >
                <FileText className="me-2 h-4 w-4" />
                {tActions('preview')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={row.status === 'generating'}
                onSelect={() => {
                  void handleDownload(row);
                }}
              >
                <Download className="me-2 h-4 w-4" />
                {tActions('download')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.status === 'draft' && (
                <DropdownMenuItem onSelect={() => openDetail(row)}>
                  <CheckCircle2 className="me-2 h-4 w-4 text-emerald-600" />
                  {tActions('finalise')}
                </DropdownMenuItem>
              )}
              {(row.status === 'finalised' || row.status === 'sent') && (
                <DropdownMenuItem onSelect={() => openDetail(row)}>
                  <Send className="me-2 h-4 w-4 text-accent-fg" />
                  {row.status === 'sent' ? tActions('resend') : tActions('send')}
                </DropdownMenuItem>
              )}
              {row.status === 'superseded' && (
                <DropdownMenuItem disabled>
                  <XCircle className="me-2 h-4 w-4" />
                  {tActions('supersededHint')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('generate')}
          </Button>
        }
      />

      {isMobile ? (
        <MobileList
          toolbar={toolbar}
          rows={rows}
          loading={loading}
          total={total}
          page={page}
          onPageChange={setPage}
          onOpen={openDetail}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={openDetail}
          keyExtractor={(row) => row.id}
          isLoading={loading}
        />
      )}

      <GenerateDocumentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={handleGenerated}
      />
    </div>
  );
}

// ─── Mobile list ──────────────────────────────────────────────────────────────

interface MobileListProps {
  toolbar: React.ReactNode;
  rows: DocumentRow[];
  loading: boolean;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (doc: DocumentRow) => void;
}

function MobileList({
  toolbar,
  rows,
  loading,
  total,
  page,
  onPageChange,
  onOpen,
}: MobileListProps) {
  const t = useTranslations('documentGen.list');
  const tTypes = useTranslations('documentGen.types');
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {toolbar}
      <div className="mt-4 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-tertiary">{t('empty')}</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpen(row)}
              className="w-full rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {tTypes(row.document_type)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {row.student ? `${row.student.first_name} ${row.student.last_name}` : '—'}
                  </p>
                </div>
                <DocumentStatusBadge status={row.status} />
              </div>
              <div className="mt-2 text-[11px] text-text-tertiary">
                {formatDateTime(row.generated_at)}
              </div>
            </button>
          ))
        )}
      </div>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>{t('pageOf', { page, total: pageCount })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
