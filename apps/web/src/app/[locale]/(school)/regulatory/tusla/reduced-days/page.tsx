'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@school/ui';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { ReducedDayForm } from '../_components/reduced-day-form';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';


// ─── Types ──────────────────────────────────────────────────────────────────

interface ReducedSchoolDayRecord {
  id: string;
  student_id: string;
  student: { id: string; first_name: string; last_name: string };
  start_date: string;
  end_date: string | null;
  hours_per_day: number;
  reason: string;
  reason_detail: string | null;
  parent_consent_date: string | null;
  review_date: string | null;
  tusla_notified: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: ReducedSchoolDayRecord[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Reason Display Map ─────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  behaviour_management: 'Behaviour Management',
  medical_needs: 'Medical Needs',
  phased_return: 'Phased Return',
  assessment_pending: 'Assessment Pending',
  other: 'Other',
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function ReducedSchoolDaysPage() {
  const t = useTranslations('regulatory');

  const [records, setRecords] = React.useState<ReducedSchoolDayRecord[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const pageSize = 20;

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<'create' | 'edit'>('create');
  const [selectedRecord, setSelectedRecord] = React.useState<ReducedSchoolDayRecord | undefined>(
    undefined,
  );

  // ─── Fetch Data ────────────────────────────────────────────────────────

  const fetchData = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const res = await apiClient<PaginatedResponse>(
        `/api/v1/regulatory/reduced-school-days?page=${p}&pageSize=${pageSize}`,
      );
      setRecords(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[ReducedSchoolDaysPage.fetchData]', err);
      setRecords([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData(page);
  }, [page, fetchData]);

  // ─── Dialog Handlers ───────────────────────────────────────────────────

  const openCreateDialog = () => {
    setDialogMode('create');
    setSelectedRecord(undefined);
    setDialogOpen(true);
  };

  const openEditDialog = (record: ReducedSchoolDayRecord) => {
    setDialogMode('edit');
    setSelectedRecord(record);
    setDialogOpen(true);
  };

  const handleFormSuccess = () => {
    setDialogOpen(false);
    setSelectedRecord(undefined);
    void fetchData(page);
  };

  const handleFormCancel = () => {
    setDialogOpen(false);
    setSelectedRecord(undefined);
  };

  // ─── Table Columns ────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('tusla.reducedDaysColStudent'),
        render: (row: ReducedSchoolDayRecord) =>
          `${row.student.first_name} ${row.student.last_name}`,
      },
      {
        key: 'start_date',
        header: t('tusla.reducedDaysColStartDate'),
        render: (row: ReducedSchoolDayRecord) => formatDate(row.start_date),
      },
      {
        key: 'end_date',
        header: t('tusla.reducedDaysColEndDate'),
        render: (row: ReducedSchoolDayRecord) =>
          row.end_date ? formatDate(row.end_date) : '\u2014',
      },
      {
        key: 'hours_per_day',
        header: t('tusla.reducedDaysColHours'),
        render: (row: ReducedSchoolDayRecord) => String(row.hours_per_day),
      },
      {
        key: 'reason',
        header: t('tusla.reducedDaysColReason'),
        render: (row: ReducedSchoolDayRecord) => REASON_LABELS[row.reason] ?? row.reason,
      },
      {
        key: 'tusla_notified',
        header: t('tusla.reducedDaysColTuslaNotified'),
        render: (row: ReducedSchoolDayRecord) =>
          row.tusla_notified ? (
            <Badge variant="success">{t('tusla.reducedDaysYes')}</Badge>
          ) : (
            <Badge variant="secondary">{t('tusla.reducedDaysNo')}</Badge>
          ),
      },
      {
        key: 'status',
        header: t('tusla.reducedDaysColStatus'),
        render: (row: ReducedSchoolDayRecord) =>
          row.is_active ? (
            <Badge variant="success">{t('tusla.reducedDaysActive')}</Badge>
          ) : (
            <Badge variant="secondary">{t('tusla.reducedDaysEnded')}</Badge>
          ),
      },
    ],
    [t],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tusla.reducedDaysTitle')}
        description={t('tusla.reducedDaysPageDescription')}
        actions={
          <Button onClick={openCreateDialog} className="min-h-[44px]">
            <Plus className="me-2 h-4 w-4" />
            {t('tusla.reducedDaysAddRecord')}
          </Button>
        }
      />

      <RegulatoryNav />

      <DataTable
        columns={columns}
        data={records}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={openEditDialog}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create'
                ? t('tusla.reducedDaysCreateTitle')
                : t('tusla.reducedDaysEditTitle')}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? t('tusla.reducedDaysCreateDescription')
                : t('tusla.reducedDaysEditDescription')}
            </DialogDescription>
          </DialogHeader>
          <ReducedDayForm
            key={selectedRecord?.id ?? 'create'}
            mode={dialogMode}
            initialData={selectedRecord}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
