/* eslint-disable school/no-hand-rolled-forms -- minimal create-session form, inline by design */
'use client';

import { Calendar, ChevronRight, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ExamSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'planning' | 'published' | 'completed';
  slot_count?: number;
  academic_period_id: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ExamSchedulesListPage() {
  const t = useTranslations('scheduling.examSchedules');
  const tCommon = useTranslations('common');
  const pathname = usePathname() ?? '';
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [sessions, setSessions] = React.useState<ExamSession[]>([]);
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);

  const fetchSessions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: ExamSession[] }>(
        '/api/v1/scheduling/exam-sessions?pageSize=50',
      );
      setSessions(res.data ?? []);
    } catch (err) {
      console.error('[ExamSchedulesListPage]', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSessions();
    apiClient<{ data: AcademicPeriod[] }>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data ?? []))
      .catch((err) => {
        console.error('[ExamSchedulesListPage]', err);
        setPeriods([]);
      });
  }, [fetchSessions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t('createSession')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-primary">{t('noSessions')}</p>
          <p className="mt-1 text-sm text-text-secondary">{t('noSessionsDesc')}</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t('createSession')}
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm"
            >
              <Link
                href={`/${locale}/scheduling/exam-schedules/${s.id}`}
                className="flex items-center gap-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-text-primary">{s.name}</p>
                    <Badge variant={s.status === 'published' ? 'default' : 'secondary'}>
                      {t(s.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {new Date(s.start_date).toLocaleDateString()} –{' '}
                    {new Date(s.end_date).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-text-tertiary rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateSessionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        periods={periods}
        onCreated={() => {
          toast.success(t('sessionCreated'));
          void fetchSessions();
        }}
        tCommon={tCommon}
      />
    </div>
  );
}

// ─── Create Session Dialog ───────────────────────────────────────────────────

function CreateSessionDialog({
  open,
  onOpenChange,
  periods,
  onCreated,
  tCommon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  periods: AcademicPeriod[];
  onCreated: () => void;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const t = useTranslations('scheduling.examSchedules');
  const tExams = useTranslations('scheduling.exams');

  const [name, setName] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setPeriodId('');
      setStartDate('');
      setEndDate('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !periodId || !startDate || !endDate) {
      setError(tExams('validationRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient('/api/v1/scheduling/exam-sessions', {
        method: 'POST',
        body: JSON.stringify({
          name,
          academic_period_id: periodId,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      onCreated();
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tCommon('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createSession')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{tExams('sessionName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tExams('sessionNamePlaceholder')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tExams('academicPeriod')}</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger>
                <SelectValue placeholder={tExams('selectPeriod')} />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tExams('startDate')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tExams('endDate')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                dir="ltr"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('createSession')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
