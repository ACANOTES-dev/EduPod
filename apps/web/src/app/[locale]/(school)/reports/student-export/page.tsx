'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Input, Label } from '@school/ui';
import { Download, Search } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ---- Types ----

interface StudentSearchResult {
  id: string;
  name: string;
  enrolment_id: string;
  grade: string;
  section: string;
}

interface StudentExportPreview {
  student: {
    id: string;
    name: string;
    enrolment_id: string;
    grade: string;
    section: string;
    date_of_birth: string;
    nationality: string;
  };
  download_url: string;
}

// ---- Page ----

export default function StudentExportPage() {
  const t = useTranslations('reports');

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<StudentSearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<StudentExportPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = React.useCallback((q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    apiClient<{ data: StudentSearchResult[] }>(
      `/api/v1/students?search=${encodeURIComponent(q)}&pageSize=10`,
    )
      .then((res) => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setIsSearching(false));
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    setPreview(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const selectStudent = (id: string) => {
    setSelectedId(id);
    setResults([]);
    setIsLoadingPreview(true);
    apiClient<StudentExportPreview>(`/api/v1/reports/student-export/${id}`)
      .then((res) => setPreview(res))
      .catch(() => setPreview(null))
      .finally(() => setIsLoadingPreview(false));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('studentExport')} />

      <div className="max-w-md">
        <Label htmlFor="student-search">{t('searchStudent')}</Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            id="student-search"
            type="text"
            placeholder={t('searchStudentPlaceholder')}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="ps-9"
          />
        </div>

        {isSearching && (
          <div className="mt-2 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        )}

        {!isSearching && results.length > 0 && !selectedId && (
          <ul className="mt-2 rounded-xl border border-border bg-surface">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => selectStudent(s.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-surface-secondary"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{s.name}</p>
                    <p className="text-xs text-text-tertiary">
                      <span dir="ltr">{s.enrolment_id}</span> &middot; {s.grade} &middot; {s.section}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isLoadingPreview && (
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-2xl bg-surface-secondary" />
        </div>
      )}

      {!isLoadingPreview && preview && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('studentName')}</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{preview.student.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('enrolmentId')}</p>
              <p className="mt-1 text-sm text-text-primary" dir="ltr">{preview.student.enrolment_id}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('grade')}</p>
              <p className="mt-1 text-sm text-text-primary">{preview.student.grade}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('section')}</p>
              <p className="mt-1 text-sm text-text-primary">{preview.student.section}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('dateOfBirth')}</p>
              <p className="mt-1 text-sm text-text-primary">{preview.student.date_of_birth}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{t('nationality')}</p>
              <p className="mt-1 text-sm text-text-primary">{preview.student.nationality}</p>
            </div>
          </div>

          <div className="mt-6">
            <Button asChild>
              <a href={preview.download_url} download>
                <Download className="me-2 h-4 w-4" />
                {t('downloadExport')}
              </a>
            </Button>
          </div>
        </div>
      )}

      {!isLoadingPreview && !preview && !selectedId && query.length < 2 && (
        <EmptyState
          icon={Download}
          title={t('searchToExport')}
          description={t('searchToExportDescription')}
        />
      )}
    </div>
  );
}
