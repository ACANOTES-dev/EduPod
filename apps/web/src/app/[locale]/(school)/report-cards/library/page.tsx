'use client';

import { ArrowLeft, Download, FileText } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types (mirror backend ReportCardLibraryRow) ─────────────────────────────

interface LibraryRow {
  id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  class: { id: string; name: string } | null;
  academic_period: { id: string; name: string };
  template: {
    id: string | null;
    content_scope: string | null;
    locale: string;
  };
  pdf_storage_key: string | null;
  pdf_download_url: string | null;
  generated_at: string;
  languages_available: string[];
}

interface LibraryResponse {
  data: LibraryRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

const PAGE_SIZE = 20;

type LanguageFilter = 'all' | 'en' | 'ar';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsLibraryPage() {
  const t = useTranslations('reportCards');
  const tl = useTranslations('reportCards.library');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // Filter options
  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);

  // Filter state
  const [classFilter, setClassFilter] = React.useState<string>('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState<string>('all');
  const [periodFilter, setPeriodFilter] = React.useState<string>('all');
  const [languageFilter, setLanguageFilter] = React.useState<LanguageFilter>('all');

  // Data
  const [rows, setRows] = React.useState<LibraryRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);

  // Load filter options once
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data ?? []))
      .catch((err) => {
        console.error('[ReportCardsLibraryPage]', err);
      });
    apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data ?? []))
      .catch((err) => {
        console.error('[ReportCardsLibraryPage]', err);
      });
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data ?? []))
      .catch((err) => {
        console.error('[ReportCardsLibraryPage]', err);
      });
  }, []);

  // Fetch library rows on filter/page change
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (classFilter !== 'all') params.set('class_id', classFilter);
        if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
        if (periodFilter !== 'all') params.set('academic_period_id', periodFilter);
        if (languageFilter !== 'all') params.set('language', languageFilter);

        const res = await apiClient<LibraryResponse>(
          `/api/v1/report-cards/library?${params.toString()}`,
        );
        if (!cancelled) {
          setRows(res.data ?? []);
          setTotal(res.meta?.total ?? 0);
        }
      } catch (err) {
        console.error('[ReportCardsLibraryPage]', err);
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classFilter, yearGroupFilter, periodFilter, languageFilter, page]);

  // Reset page on filter changes
  React.useEffect(() => {
    setPage(1);
  }, [classFilter, yearGroupFilter, periodFilter, languageFilter]);

  // Refetch a fresh signed URL and open it. Backend library URLs are short-lived
  // (5-minute TTL) so we always re-request before download to avoid stale links.
  const handleDownload = React.useCallback(async (row: LibraryRow, targetLanguage: string) => {
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '1',
        academic_period_id: row.academic_period.id,
        language: targetLanguage,
      });
      // Narrow to the student's class if we have it — keeps the query tight.
      if (row.class) params.set('class_id', row.class.id);
      const res = await apiClient<LibraryResponse>(
        `/api/v1/report-cards/library?${params.toString()}`,
      );
      const match = (res.data ?? []).find((r) => r.student.id === row.student.id);
      const url = match?.pdf_download_url ?? row.pdf_download_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('[ReportCardsLibraryPage.handleDownload]', err);
      if (row.pdf_download_url) {
        window.open(row.pdf_download_url, '_blank', 'noopener,noreferrer');
      }
    }
  }, []);

  const formatGeneratedAt = React.useCallback(
    (iso: string): string => {
      try {
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          // Always Gregorian calendar and Western numerals per project i18n rule
          calendar: 'gregory',
          numberingSystem: 'latn',
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [locale],
  );

  const columns = React.useMemo(
    () => [
      {
        key: 'student',
        header: tl('columnStudent'),
        render: (row: LibraryRow) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">
              {row.student.first_name} {row.student.last_name}
            </span>
            {row.student.student_number && (
              <span className="text-xs text-text-tertiary tabular-nums" dir="ltr">
                {row.student.student_number}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'class',
        header: tl('columnClass'),
        render: (row: LibraryRow) => (
          <span className="text-text-primary">{row.class?.name ?? '—'}</span>
        ),
      },
      {
        key: 'period',
        header: tl('columnPeriod'),
        render: (row: LibraryRow) => (
          <span className="text-text-primary">{row.academic_period.name}</span>
        ),
      },
      {
        key: 'template',
        header: tl('columnTemplate'),
        render: (row: LibraryRow) => (
          <span className="text-xs text-text-secondary">{row.template.content_scope ?? '—'}</span>
        ),
      },
      {
        key: 'languages',
        header: tl('columnLanguages'),
        render: (row: LibraryRow) => (
          <div className="flex items-center gap-1">
            {row.languages_available.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-700 ring-1 ring-primary-200"
                dir="ltr"
              >
                {lang}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: 'generated',
        header: tl('columnGenerated'),
        render: (row: LibraryRow) => (
          <span className="text-xs text-text-tertiary tabular-nums" dir="ltr">
            {formatGeneratedAt(row.generated_at)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: tl('columnActions'),
        render: (row: LibraryRow) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.languages_available.includes('en') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(row, 'en')}
                disabled={!row.pdf_storage_key && !row.pdf_download_url}
              >
                <Download className="me-1.5 h-3.5 w-3.5" />
                {tl('downloadEn')}
              </Button>
            )}
            {row.languages_available.includes('ar') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(row, 'ar')}
                disabled={!row.pdf_storage_key && !row.pdf_download_url}
              >
                <Download className="me-1.5 h-3.5 w-3.5" />
                {tl('downloadAr')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [tl, formatGeneratedAt, handleDownload],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={tl('filterClass')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tl('classAll')}</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={tl('filterYearGroup')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tl('yearGroupAll')}</SelectItem>
          {yearGroups.map((yg) => (
            <SelectItem key={yg.id} value={yg.id}>
              {yg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={periodFilter} onValueChange={setPeriodFilter}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={tl('filterPeriod')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tl('periodAll')}</SelectItem>
          <SelectItem value="full_year">{tl('periodFullYear')}</SelectItem>
          {periods.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={languageFilter} onValueChange={(v) => setLanguageFilter(v as LanguageFilter)}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={tl('filterLanguage')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tl('languageAll')}</SelectItem>
          <SelectItem value="en">{tl('languageEn')}</SelectItem>
          <SelectItem value="ar">{tl('languageAr')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={tl('title')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/report-cards`)}>
            <ArrowLeft className="me-1.5 h-4 w-4" />
            {t('backToReportCards')}
          </Button>
        }
      />

      {!isLoading && loadFailed ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{tl('loadFailed')}</p>
        </div>
      ) : !isLoading && rows.length === 0 ? (
        <>
          {toolbar}
          <div className="rounded-lg border border-border bg-surface p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-3 text-sm text-text-secondary">{tl('noDocuments')}</p>
          </div>
        </>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
