'use client';

import { Download, FileText, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Label,
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
import { apiClient, getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  name: string;
}

interface OverviewRow {
  id: string;
  student_name: string;
  student_number: string | null;
  subject_name: string;
  class_name: string;
  period_name: string;
  academic_period_id: string;
  final_grade: string;
  computed_value: number;
  has_override: boolean;
}

interface OverviewResponse {
  data: OverviewRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

const TEMPLATES = [
  { id: 'classic', name: 'Classic' },
  { id: 'modern', name: 'Modern' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = React.useState<'overview' | 'generate'>('overview');

  // Shared dropdown data
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);

  React.useEffect(() => {
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch((err) => { console.error('[ReportCardsPage]', err); });
    apiClient<ListResponse<SchoolClass>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch((err) => { console.error('[ReportCardsPage]', err); });
  }, []);

  const tabs = [
    { key: 'overview' as const, label: t('overviewTab') },
    { key: 'generate' as const, label: t('generateTab') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-border" aria-label={t('reportCardsTabs')}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab.key
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <OverviewTab periods={periods} classes={classes} t={t} tc={tc} />
      )}

      {activeTab === 'generate' && (
        <GenerateTab periods={periods} classes={classes} t={t} tc={tc} />
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface TabProps {
  periods: AcademicPeriod[];
  classes: SchoolClass[];
  t: ReturnType<typeof useTranslations<'reportCards'>>;
  tc: ReturnType<typeof useTranslations<'common'>>;
}

function OverviewTab({ periods, classes, t, tc }: TabProps) {
  const tCommon = useTranslations('common');
  const [data, setData] = React.useState<OverviewRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [generatingAllComments, setGeneratingAllComments] = React.useState(false);

  const [classFilter, setClassFilter] = React.useState('all');
  const [periodFilter, setPeriodFilter] = React.useState('all');

  const fetchOverview = React.useCallback(async (p: number, classId: string, periodId: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (classId !== 'all') params.set('class_id', classId);
      if (periodId !== 'all') params.set('academic_period_id', periodId);
      const res = await apiClient<OverviewResponse>(
        `/api/v1/report-cards/overview?${params.toString()}`,
      );
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[ReportCardsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchOverview(page, classFilter, periodFilter);
  }, [page, classFilter, periodFilter, fetchOverview]);

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    try {
      // Fetch all matching data (paginated)
      let allData: OverviewRow[] = [];
      let currentPage = 1;
      let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ page: String(currentPage), pageSize: '100' });
        if (classFilter !== 'all') params.set('class_id', classFilter);
        if (periodFilter !== 'all') params.set('academic_period_id', periodFilter);
        const res = await apiClient<OverviewResponse>(
          `/api/v1/report-cards/overview?${params.toString()}`,
        );
        allData = [...allData, ...res.data];
        hasMore = allData.length < res.meta.total;
        currentPage++;
      }

      const exportColumns = [
        { header: t('student'), key: 'student_name' },
        { header: t('subject'), key: 'subject_name' },
        { header: t('className'), key: 'class_name' },
        { header: t('period'), key: 'period_name' },
        { header: t('finalGrade'), key: 'final_grade' },
        { header: t('score'), key: 'computed_value' },
      ];

      const exportRows = allData.map((row) => ({
        student_name: row.student_name,
        subject_name: row.subject_name,
        class_name: row.class_name,
        period_name: row.period_name,
        final_grade: row.final_grade,
        computed_value: row.computed_value,
      }));

      const options = {
        fileName: 'report-cards-overview',
        title: t('title'),
        columns: exportColumns,
        rows: exportRows,
      };

      if (format === 'xlsx') {
        const { exportToExcel } = await import('@/lib/export-utils');
        exportToExcel(options);
      } else {
        const { exportToPdf } = await import('@/lib/export-utils');
        exportToPdf(options);
      }
    } catch (err) {
      console.error('[ReportCardsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleGenerateAllComments = async () => {
    if (classFilter === 'all' || periodFilter === 'all') {
      toast.error(t('aiGenerateAllSelectFirst'));
      return;
    }
    setGeneratingAllComments(true);
    try {
      await apiClient('/api/v1/report-cards/ai-generate-comments', {
        method: 'POST',
        body: JSON.stringify({ class_id: classFilter, academic_period_id: periodFilter }),
      });
      toast.success(t('aiGenerateAllSuccess'));
    } catch (err) {
      console.error('[ReportCardsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setGeneratingAllComments(false);
    }
  };

  const columns = [
    {
      key: 'student',
      header: t('student'),
      render: (row: OverviewRow) => (
        <div>
          <span className="font-medium text-text-primary">{row.student_name}</span>
          {row.student_number && (
            <span className="ms-2 text-xs text-text-tertiary font-mono" dir="ltr">
              {row.student_number}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'subject',
      header: t('subject'),
      render: (row: OverviewRow) => <span className="text-text-secondary">{row.subject_name}</span>,
    },
    {
      key: 'period',
      header: t('period'),
      render: (row: OverviewRow) => <span className="text-text-secondary">{row.period_name}</span>,
    },
    {
      key: 'finalGrade',
      header: t('finalGrade'),
      render: (row: OverviewRow) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{row.final_grade}</span>
          {row.has_override && (
            <StatusBadge status="warning" dot>
              {t('overridden')}
            </StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: 'score',
      header: t('score'),
      render: (row: OverviewRow) => (
        <span className="text-text-secondary font-mono text-sm" dir="ltr">
          {row.computed_value.toFixed(1)}%
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={classFilter}
        onValueChange={(v) => {
          setClassFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('selectClass')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allClasses')}</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={periodFilter}
        onValueChange={(v) => {
          setPeriodFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={t('selectPeriod')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allPeriods')}</SelectItem>
          {periods.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select onValueChange={(v) => void handleExport(v as 'xlsx' | 'pdf')}>
        <SelectTrigger className="w-full sm:w-[130px]">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span>{tc('export')}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="xlsx">{tCommon('excelFormat')}</SelectItem>
          <SelectItem value="pdf">{tCommon('pdfFormat')}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        onClick={handleGenerateAllComments}
        disabled={generatingAllComments || classFilter === 'all' || periodFilter === 'all'}
      >
        {generatingAllComments ? (
          <Loader2 className="me-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="me-2 h-4 w-4" />
        )}
        {t('aiGenerateAllComments')}
      </Button>
    </div>
  );

  return (
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
  );
}

// ─── Generate Tab ─────────────────────────────────────────────────────────────

function GenerateTab({ periods, classes, t, tc }: TabProps) {
  const [selectedClass, setSelectedClass] = React.useState('');
  const [selectedPeriod, setSelectedPeriod] = React.useState('');
  const [selectedTemplate, setSelectedTemplate] = React.useState<string>(TEMPLATES[0].id);
  const [generating, setGenerating] = React.useState(false);

  const canGenerate = selectedClass && selectedPeriod;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const token = getAccessToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${API_URL}/api/v1/report-cards/generate-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          class_id: selectedClass,
          academic_period_id: selectedPeriod,
          template_id: selectedTemplate,
        }),
      });

      if (response.status === 204) {
        toast.error(t('noStudents'));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      toast.success(t('generated'));
    } catch (err) {
      console.error('[ReportCardsPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-text-primary">{t('generateTab')}</h3>
          <p className="text-sm text-text-secondary">{t('generateDescription')}</p>
        </div>

        {/* Class filter */}
        <div className="space-y-1.5">
          <Label>{t('selectClass')}</Label>
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectClass')} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Term filter */}
        <div className="space-y-1.5">
          <Label>{t('selectPeriod')}</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectPeriod')} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Template selector */}
        <div className="space-y-1.5">
          <Label>{t('selectTemplate')}</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectTemplate')} />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Generate button */}
        <Button onClick={handleGenerate} disabled={generating || !canGenerate} className="w-full">
          {generating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('generating')}
            </>
          ) : (
            <>
              <FileText className="me-2 h-4 w-4" />
              {t('generateBatch')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
