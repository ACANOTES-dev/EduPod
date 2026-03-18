'use client';

import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';
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
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import {
  AcademicYearForm,
  type AcademicYearFormValues,
} from './_components/academic-year-form';
import { PeriodManagement } from './_components/period-management';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  _count?: { academic_periods: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AcademicYearsPage() {
  const t = useTranslations('academicYears');
  const tc = useTranslations('common');

  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AcademicYear | null>(null);

  const fetchYears = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: AcademicYear[] }>(
        '/api/v1/academic-years?pageSize=100&sort=start_date&order=desc',
      );
      setYears(res.data);
    } catch {
      setYears([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchYears();
  }, [fetchYears]);

  const handleCreate = async (values: AcademicYearFormValues) => {
    await apiClient('/api/v1/academic-years', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    void fetchYears();
  };

  const handleUpdate = async (values: AcademicYearFormValues) => {
    if (!editTarget) return;
    await apiClient(`/api/v1/academic-years/${editTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    void fetchYears();
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient(`/api/v1/academic-years/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      void fetchYears();
    } catch {
      // silently fail
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'active') return <StatusBadge status="success" dot>{t('statusActive')}</StatusBadge>;
    if (status === 'planned') return <StatusBadge status="info" dot>{t('statusPlanned')}</StatusBadge>;
    return <StatusBadge status="neutral" dot>{t('statusClosed')}</StatusBadge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newAcademicYear')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : years.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noYears')}</p>
      ) : (
        <div className="space-y-3">
          {years.map((year) => (
            <div key={year.id} className="rounded-xl border border-border bg-surface shadow-sm">
              {/* Year row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedId(expandedId === year.id ? null : year.id)}
                  className="flex items-center gap-2 text-start text-sm font-medium text-text-primary"
                >
                  {expandedId === year.id ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary rtl:rotate-180" />
                  )}
                  {year.name}
                </button>
                <span className="text-xs text-text-tertiary" dir="ltr">
                  {formatDate(year.start_date)} –{' '}
                  {formatDate(year.end_date)}
                </span>
                {statusBadge(year.status)}
                <span className="text-xs text-text-tertiary">
                  {year._count?.academic_periods ?? 0} {t('periods')}
                </span>
                <div className="ms-auto flex items-center gap-2">
                  {/* Status transition */}
                  <Select
                    value={year.status}
                    onValueChange={(v) => handleStatusChange(year.id, v)}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">{t('statusPlanned')}</SelectItem>
                      <SelectItem value="active">{t('statusActive')}</SelectItem>
                      <SelectItem value="closed">{t('statusClosed')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(year)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">{tc('edit')}</span>
                  </Button>
                </div>
              </div>

              {/* Periods inline */}
              {expandedId === year.id && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <PeriodManagement academicYearId={year.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AcademicYearForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        title={t('newAcademicYear')}
        submitLabel={t('createAcademicYear')}
      />

      {editTarget && (
        <AcademicYearForm
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          initialValues={{
            name: editTarget.name,
            start_date: editTarget.start_date.slice(0, 10),
            end_date: editTarget.end_date.slice(0, 10),
            status: editTarget.status,
          }}
          onSubmit={handleUpdate}
          title={t('editAcademicYear')}
        />
      )}
    </div>
  );
}
