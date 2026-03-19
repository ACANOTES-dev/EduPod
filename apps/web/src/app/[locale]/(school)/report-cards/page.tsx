'use client';

import { Eye, FileText, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { GenerateDialog } from './_components/generate-dialog';
import { PdfPreviewModal } from './_components/pdf-preview-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ReportCard {
  id: string;
  student_name: string;
  academic_period_name: string;
  status: string;
  locale: string;
  published_at: string | null;
  created_at: string;
}

interface ReportCardsResponse {
  data: ReportCard[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  revised: 'neutral',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<ReportCard[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [periodFilter, setPeriodFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
  }, []);

  const fetchReportCards = React.useCallback(
    async (p: number, period: string, status: string, search: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (period !== 'all') params.set('academic_period_id', period);
        if (status !== 'all') params.set('status', status);
        if (search) params.set('search', search);
        const res = await apiClient<ReportCardsResponse>(`/api/v1/report-cards?${params.toString()}`);
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchReportCards(page, periodFilter, statusFilter, searchQuery);
  }, [page, periodFilter, statusFilter, searchQuery, fetchReportCards]);

  const handlePublish = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-cards/${id}/publish`, { method: 'POST' });
      void fetchReportCards(page, periodFilter, statusFilter, searchQuery);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleRevise = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-cards/${id}/revise`, { method: 'POST' });
      void fetchReportCards(page, periodFilter, statusFilter, searchQuery);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handlePreview = (id: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    setPreviewUrl(`${baseUrl}/api/v1/report-cards/${id}/pdf`);
  };

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (row: ReportCard) => (
        <span className="font-medium text-text-primary">{row.student_name}</span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (row: ReportCard) => (
        <span className="text-text-secondary">{row.academic_period_name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ReportCard) => (
        <StatusBadge status={STATUS_VARIANT[row.status] ?? 'neutral'} dot>
          {t(`status${row.status.charAt(0).toUpperCase() + row.status.slice(1)}` as 'statusDraft' | 'statusPublished' | 'statusRevised')}
        </StatusBadge>
      ),
    },
    {
      key: 'locale',
      header: 'Locale',
      render: (row: ReportCard) => (
        <span className="text-text-secondary uppercase text-xs font-mono" dir="ltr">{row.locale}</span>
      ),
    },
    {
      key: 'published_at',
      header: 'Published',
      render: (row: ReportCard) => (
        <span className="text-text-secondary text-xs font-mono" dir="ltr">
          {row.published_at ? new Date(row.published_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: ReportCard) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${locale}/report-cards/${row.id}`);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handlePreview(row.id);
            }}
          >
            <FileText className="h-4 w-4" />
          </Button>
          {row.status === 'draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handlePublish(row.id);
              }}
            >
              {t('publish')}
            </Button>
          )}
          {row.status === 'published' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleRevise(row.id);
              }}
            >
              {t('revise')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setPage(1);
        }}
        placeholder={tc('search')}
        className="w-48"
      />
      <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setPage(1); }}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder={t('selectPeriod')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Periods</SelectItem>
          {periods.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="draft">{t('statusDraft')}</SelectItem>
          <SelectItem value="published">{t('statusPublished')}</SelectItem>
          <SelectItem value="revised">{t('statusRevised')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('generate')}
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

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => void fetchReportCards(page, periodFilter, statusFilter, searchQuery)}
      />

      <PdfPreviewModal
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
}
