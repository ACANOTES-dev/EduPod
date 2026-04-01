'use client';

import { Plus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface Enrolment {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  student: Student;
}

interface EnrolmentManagementProps {
  classId: string;
}

// ─── Enrol Dialog ─────────────────────────────────────────────────────────────

interface EnrolDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function EnrolDialog({ classId, open, onOpenChange, onSuccess }: EnrolDialogProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [students, setStudents] = React.useState<Student[]>([]);
  const [studentId, setStudentId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    apiClient<{ data: Student[] }>('/api/v1/students?pageSize=100&status=active')
      .then((res) => setStudents(res.data))
      .catch(() => setStudents([]));
  }, [open]);

  const handleSubmit = async () => {
    if (!studentId || !startDate) {
      setError(t('enrolFieldsRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient(`/api/v1/classes/${classId}/enrolments`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId, start_date: startDate }),
      });
      onSuccess();
      onOpenChange(false);
      setStudentId('');
      setStartDate('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('enrolStudent')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fieldStudent')}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectStudent')} />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                    {s.student_number ? ` (${s.student_number})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fieldStartDate')}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              dir="ltr"
            />
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc('loading') : t('enrol')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Enrol Dialog ────────────────────────────────────────────────────────

interface BulkEnrolDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

function BulkEnrolDialog({ classId, open, onOpenChange, onSuccess }: BulkEnrolDialogProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [students, setStudents] = React.useState<Student[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [startDate, setStartDate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    apiClient<{ data: Student[] }>('/api/v1/students?pageSize=100&status=active')
      .then((res) => setStudents(res.data))
      .catch(() => setStudents([]));
  }, [open]);

  const toggleStudent = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (selected.length === 0 || !startDate) {
      setError(t('bulkEnrolFieldsRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient(`/api/v1/classes/${classId}/enrolments/bulk`, {
        method: 'POST',
        body: JSON.stringify({ student_ids: selected, start_date: startDate }),
      });
      onSuccess();
      onOpenChange(false);
      setSelected([]);
      setStartDate('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bulkEnrol')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fieldStartDate')}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('selectStudents')} ({selected.length} {t('selected')})
            </Label>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
              {students.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-secondary"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm text-text-primary">
                    {s.first_name} {s.last_name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc('loading') : t('enrolSelected')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EnrolmentManagement({ classId }: EnrolmentManagementProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [enrolments, setEnrolments] = React.useState<Enrolment[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [enrolOpen, setEnrolOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const fetchEnrolments = React.useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const res = await apiClient<{ data: Enrolment[]; meta?: { total: number } }>(
          `/api/v1/classes/${classId}/enrolments?page=${p}&pageSize=${PAGE_SIZE}`,
        );
        const data = res.data ?? [];
        setEnrolments(data);
        setTotal(res.meta?.total ?? data.length);
      } catch {
        setEnrolments([]);
      } finally {
        setIsLoading(false);
      }
    },
    [classId],
  );

  React.useEffect(() => {
    void fetchEnrolments(page);
  }, [page, fetchEnrolments]);

  const handleStatusChange = async (enrolmentId: string, status: string) => {
    try {
      await apiClient(`/api/v1/classes/${classId}/enrolments/${enrolmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      void fetchEnrolments(page);
    } catch (err) {
      // silently fail — user can retry
      console.error('[fetchEnrolments]', err);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'active')
      return (
        <StatusBadge status="success" dot>
          {t('enrolActive')}
        </StatusBadge>
      );
    if (status === 'dropped')
      return (
        <StatusBadge status="danger" dot>
          {t('enrolDropped')}
        </StatusBadge>
      );
    return (
      <StatusBadge status="neutral" dot>
        {t('enrolCompleted')}
      </StatusBadge>
    );
  };

  const columns = [
    {
      key: 'student',
      header: t('colStudent'),
      render: (row: Enrolment) => (
        <span className="font-medium text-text-primary">
          {row.student.first_name} {row.student.last_name}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('colStatus'),
      render: (row: Enrolment) => statusBadge(row.status),
    },
    {
      key: 'start_date',
      header: t('fieldStartDate'),
      render: (row: Enrolment) => (
        <span className="text-text-secondary" dir="ltr">
          {formatDate(row.start_date)}
        </span>
      ),
    },
    {
      key: 'end_date',
      header: t('fieldEndDate'),
      render: (row: Enrolment) => (
        <span className="text-text-secondary" dir="ltr">
          {row.end_date ? formatDate(row.end_date) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: Enrolment) => (
        <Select value={row.status} onValueChange={(v) => handleStatusChange(row.id, v)}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t('enrolActive')}</SelectItem>
            <SelectItem value="dropped">{t('enrolDropped')}</SelectItem>
            <SelectItem value="completed">{t('enrolCompleted')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          <Users className="me-1.5 h-4 w-4" />
          {t('bulkEnrol')}
        </Button>
        <Button size="sm" onClick={() => setEnrolOpen(true)}>
          <Plus className="me-1.5 h-4 w-4" />
          {t('enrolStudent')}
        </Button>
      </div>

      {!isLoading && enrolments.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('noEnrolments')}
          description={t('noEnrolmentsDesc')}
          action={{ label: t('enrolStudent'), onClick: () => setEnrolOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={enrolments}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      <EnrolDialog
        classId={classId}
        open={enrolOpen}
        onOpenChange={setEnrolOpen}
        onSuccess={() => fetchEnrolments(page)}
      />
      <BulkEnrolDialog
        classId={classId}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSuccess={() => fetchEnrolments(page)}
      />
    </div>
  );
}
