'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react';
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
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffProfile {
  id: string;
  full_name: string;
  department?: string | null;
}

interface AbsenceSlot {
  schedule_id: string;
  period_name: string;
  period_order: number;
  subject_name: string;
  class_name: string;
  substitute_status: 'unassigned' | 'assigned' | 'confirmed' | 'declined' | 'completed';
  substitute_name: string | null;
  substitution_record_id: string | null;
}

interface TeacherAbsence {
  id: string;
  staff_profile_id: string;
  teacher_name: string;
  absence_date: string;
  full_day: boolean;
  reason: string | null;
  slots: AbsenceSlot[];
}

interface SubstituteSuggestion {
  staff_profile_id: string;
  full_name: string;
  cover_count: number;
  qualification_match: 'primary' | 'eligible';
  confidence: number;
  reason: string;
}

interface SubstitutionRecord {
  id: string;
  absence_date: string;
  absent_teacher_name: string;
  substitute_name: string;
  period_name: string;
  subject_name: string;
  class_name: string;
  status: 'assigned' | 'confirmed' | 'declined' | 'completed';
  assigned_at: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: AbsenceSlot['substitute_status'] | SubstitutionRecord['status'];
}) {
  const variants: Record<string, string> = {
    unassigned: 'bg-warning-100 text-warning-700 border-warning-200',
    assigned: 'bg-blue-100 text-blue-700 border-blue-200',
    confirmed: 'bg-green-100 text-green-700 border-green-200',
    declined: 'bg-red-100 text-red-700 border-red-200',
    completed: 'bg-surface-secondary text-text-tertiary border-border',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variants[status] ?? variants.unassigned}`}
    >
      {status}
    </span>
  );
}

function SuggestionsModal({
  open,
  onOpenChange,
  slot,
  suggestions,
  loading,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: AbsenceSlot | null;
  suggestions: SubstituteSuggestion[];
  loading: boolean;
  onAssign: (staffId: string) => Promise<void>;
}) {
  const t = useTranslations('scheduling.substitutions');
  const [assigning, setAssigning] = React.useState<string | null>(null);

  const handleAssign = async (staffId: string) => {
    setAssigning(staffId);
    try {
      await onAssign(staffId);
      onOpenChange(false);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('findSubstitute')}</DialogTitle>
        </DialogHeader>
        {slot && (
          <p className="text-sm text-text-secondary">
            {slot.period_name} &middot; {slot.subject_name} &middot; {slot.class_name}
          </p>
        )}
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('rankingCandidates')}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="py-4 text-sm text-text-secondary">{t('noSuggestions')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {suggestions.map((s) => (
              <li key={s.staff_profile_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{s.full_name}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${s.qualification_match === 'primary' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}
                    >
                      {s.qualification_match === 'primary' ? t('primaryMatch') : t('eligibleMatch')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">{s.reason}</p>
                  <p className="text-xs text-text-tertiary">
                    {t('coverCount', { count: s.cover_count })} &middot;{' '}
                    {t('confidence', { pct: Math.round(s.confidence * 100) })}%
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={assigning === s.staff_profile_id}
                  onClick={() => void handleAssign(s.staff_profile_id)}
                >
                  {assigning === s.staff_profile_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin me-1" />
                  ) : (
                    <UserCheck className="h-3.5 w-3.5 me-1" />
                  )}
                  {t('assign')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportAbsenceModal({
  open,
  onOpenChange,
  staff,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffProfile[];
  onSubmit: (values: {
    staff_profile_id: string;
    absence_date: string;
    full_day: boolean;
    period_from: number | null;
    period_to: number | null;
    reason: string;
  }) => Promise<void>;
}) {
  const t = useTranslations('scheduling.substitutions');
  const tc = useTranslations('common');
  const [staffId, setStaffId] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().split('T')[0] ?? '');
  const [fullDay, setFullDay] = React.useState(true);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setStaffId('');
      setDate(new Date().toISOString().split('T')[0] ?? '');
      setFullDay(true);
      setReason('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId || !date) {
      setError(t('validationRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit({
        staff_profile_id: staffId,
        absence_date: date,
        full_day: fullDay,
        period_from: null,
        period_to: null,
        reason,
      });
      onOpenChange(false);
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
          <DialogTitle>{t('reportAbsence')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('selectTeacher')}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectTeacherPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('absenceDate')}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              required
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>{t('fullDay')}</Label>
            <Switch checked={fullDay} onCheckedChange={setFullDay} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('reason')}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {t('reportAbsenceSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Today Tab ────────────────────────────────────────────────────────────────

function TodayTab() {
  const t = useTranslations('scheduling.substitutions');
  const [absences, setAbsences] = React.useState<TeacherAbsence[]>([]);
  const [staff, setStaff] = React.useState<StaffProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [activeSlot, setActiveSlot] = React.useState<{
    absenceId: string;
    slot: AbsenceSlot;
  } | null>(null);
  const [suggestions, setSuggestions] = React.useState<SubstituteSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = React.useState(false);

  const today = new Date().toISOString().split('T')[0];

  const fetchAbsences = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: TeacherAbsence[] }>(
        `/api/v1/scheduling/absences?date=${today ?? ''}`,
      );
      setAbsences(res.data ?? []);
    } catch {
      setAbsences([]);
    } finally {
      setLoading(false);
    }
  }, [today]);

  React.useEffect(() => {
    void fetchAbsences();
    apiClient<{ data: StaffProfile[] }>('/api/v1/staff?pageSize=200&role=teacher')
      .then((res) => setStaff(res.data ?? []))
      .catch(() => setStaff([]));
  }, [fetchAbsences]);

  const handleFindSub = async (absenceId: string, slot: AbsenceSlot) => {
    setActiveSlot({ absenceId, slot });
    setSuggestOpen(true);
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const res = await apiClient<{ data: SubstituteSuggestion[] }>(
        `/api/v1/scheduling/absences/${absenceId}/suggestions?schedule_id=${slot.schedule_id}`,
      );
      setSuggestions(res.data ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleAssign = async (staffId: string) => {
    if (!activeSlot) return;
    await apiClient('/api/v1/scheduling/substitutions', {
      method: 'POST',
      body: JSON.stringify({
        absence_id: activeSlot.absenceId,
        schedule_id: activeSlot.slot.schedule_id,
        substitute_staff_id: staffId,
      }),
    });
    toast.success(t('assignSuccess'));
    void fetchAbsences();
  };

  const handleReportAbsence = async (
    values: Parameters<typeof ReportAbsenceModal>[0]['onSubmit'] extends (v: infer V) => unknown
      ? V
      : never,
  ) => {
    await apiClient('/api/v1/scheduling/absences', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    toast.success(t('absenceReported'));
    void fetchAbsences();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }

  if (absences.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="text-base font-medium text-text-primary">{t('noAbsencesToday')}</p>
        <p className="text-sm text-text-secondary">{t('noAbsencesDesc')}</p>
        <Button onClick={() => setReportOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('reportAbsence')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setReportOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('reportAbsence')}
        </Button>
      </div>

      {absences.map((absence) => (
        <div key={absence.id} className="rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <UserX className="h-5 w-5 text-warning-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">{absence.teacher_name}</p>
              <p className="text-xs text-text-tertiary">
                {absence.full_day ? t('fullDay') : t('partialDay')}
                {absence.reason ? ` · ${absence.reason}` : ''}
              </p>
            </div>
            <Badge variant="secondary">
              {absence.slots.filter((s) => s.substitute_status === 'unassigned').length}{' '}
              {t('unassigned')}
            </Badge>
          </div>

          <div className="divide-y divide-border">
            {absence.slots.map((slot) => (
              <div key={slot.schedule_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-text-primary">
                    {slot.period_name} &middot; {slot.subject_name}
                  </p>
                  <p className="text-xs text-text-secondary">{slot.class_name}</p>
                </div>
                <StatusBadge status={slot.substitute_status} />
                {slot.substitute_name && (
                  <span className="text-xs text-text-secondary">{slot.substitute_name}</span>
                )}
                {slot.substitute_status === 'unassigned' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleFindSub(absence.id, slot)}
                  >
                    <Search className="h-3.5 w-3.5 me-1" />
                    {t('findSub')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <ReportAbsenceModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        staff={staff}
        onSubmit={handleReportAbsence}
      />

      <SuggestionsModal
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        slot={activeSlot?.slot ?? null}
        suggestions={suggestions}
        loading={suggestLoading}
        onAssign={handleAssign}
      />
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const t = useTranslations('scheduling.substitutions');
  const [records, setRecords] = React.useState<SubstitutionRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const pageSize = 20;

  const fetchHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      const res = await apiClient<{ data: SubstitutionRecord[]; meta: { total: number } }>(
        `/api/v1/scheduling/substitutions?${params.toString()}`,
      );
      setRecords(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  React.useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('searchHistory')}
            className="ps-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">{t('noHistory')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('date')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('absentTeacher')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('substitute')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('period')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('subject')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase">
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr
                  key={rec.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50"
                >
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(rec.absence_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {rec.absent_teacher_name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{rec.substitute_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{rec.period_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{rec.subject_name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rec.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>{t('pageOf', { page, total: totalPages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubstitutionsPage() {
  const t = useTranslations('scheduling.substitutions');
  const [activeTab, setActiveTab] = React.useState<'today' | 'history'>('today');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['today', 'history'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'today' ? (
              <Clock className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {t(`tab_${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'today' ? <TodayTab /> : <HistoryTab />}
    </div>
  );
}
