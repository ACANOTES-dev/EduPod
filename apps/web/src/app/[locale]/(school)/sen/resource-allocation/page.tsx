'use client';

import {
  Badge,
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
  Skeleton,
  StatCard,
  Textarea,
  toast,
} from '@school/ui';
import { AlertTriangle, Clock, Loader2, Pencil, Plus, Search, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Allocation {
  id: string;
  academic_year_id: string;
  academic_year_name: string;
  total_hours: number;
  source: string;
  notes: string | null;
  created_at: string;
}

interface AllocationResponse {
  data: Allocation[];
  meta: { page: number; pageSize: number; total: number };
}

interface StudentHours {
  id: string;
  resource_allocation_id: string;
  student_id: string;
  student_name: string;
  sen_profile_id: string;
  allocated_hours: number;
  used_hours: number;
  notes: string | null;
}

interface StudentHoursResponse {
  data: StudentHours[];
}

interface UtilisationResponse {
  data: {
    academic_year_id: string;
    total_allocated_hours: number;
    total_used_hours: number;
    utilisation_percentage: number;
    allocations_by_source: Record<string, number>;
    student_breakdown: Array<{
      student_name: string;
      allocated: number;
      used: number;
    }>;
  };
}

interface AcademicYear {
  id: string;
  name: string;
}

interface StudentResult {
  id: string;
  full_name: string;
  sen_profile_id?: string;
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const t = useTranslations('sen');
  if (source === 'seno') {
    return <Badge variant="info">{t('resource.sourceSeno')}</Badge>;
  }
  return <Badge variant="secondary">{t('resource.sourceSchool')}</Badge>;
}

// ─── Allocation Dialog ────────────────────────────────────────────────────────

interface AllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  initial?: Allocation | null;
  academicYears: AcademicYear[];
}

function AllocationDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
  academicYears,
}: AllocationDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [academicYearId, setAcademicYearId] = React.useState(initial?.academic_year_id ?? '');
  const [totalHours, setTotalHours] = React.useState(initial?.total_hours?.toString() ?? '');
  const [source, setSource] = React.useState(initial?.source ?? 'school');
  const [notes, setNotes] = React.useState(initial?.notes ?? '');

  React.useEffect(() => {
    if (open) {
      setAcademicYearId(initial?.academic_year_id ?? '');
      setTotalHours(initial?.total_hours?.toString() ?? '');
      setSource(initial?.source ?? 'school');
      setNotes(initial?.notes ?? '');
    }
  }, [open, initial]);

  const handleSave = React.useCallback(async () => {
    if (!academicYearId || !totalHours) return;
    setSaving(true);
    try {
      const payload = {
        academic_year_id: academicYearId,
        total_hours: Number(totalHours),
        source,
        notes: notes || null,
      };

      if (initial) {
        await apiClient(`/api/v1/sen/resource-allocations/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success(t('resource.allocationUpdated'));
      } else {
        await apiClient('/api/v1/sen/resource-allocations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(t('resource.allocationCreated'));
      }

      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error('[AllocationDialog] save', err);
      toast.error(t('resource.allocationSaveError'));
    } finally {
      setSaving(false);
    }
  }, [academicYearId, totalHours, source, notes, initial, onOpenChange, onSubmit, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? t('resource.editAllocation') : t('resource.addAllocation')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('resource.academicYear')}</Label>
            <Select value={academicYearId} onValueChange={setAcademicYearId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('resource.selectAcademicYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((ay) => (
                  <SelectItem key={ay.id} value={ay.id}>
                    {ay.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('resource.totalHours')}</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('resource.source')}</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seno">{t('resource.sourceSeno')}</SelectItem>
                <SelectItem value="school">{t('resource.sourceSchool')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('resource.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('resource.notesPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('resource.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !academicYearId || !totalHours}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {initial ? t('resource.save') : t('resource.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Student Hours Dialog ─────────────────────────────────────────────────────

interface StudentHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  allocations: Allocation[];
}

function StudentHoursDialog({
  open,
  onOpenChange,
  onSubmit,
  allocations,
}: StudentHoursDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  const [allocationId, setAllocationId] = React.useState('');
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResult | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [allocatedHours, setAllocatedHours] = React.useState('');
  const [notes, setNotes] = React.useState('');

  // Debounced student search
  React.useEffect(() => {
    if (!studentSearch || studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiClient<{ data: StudentResult[] }>(
          `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
        );
        setStudentResults(res.data);
      } catch (err) {
        console.error('[StudentHoursDialog] search', err);
        setStudentResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [studentSearch]);

  React.useEffect(() => {
    if (open) {
      setAllocationId('');
      setStudentSearch('');
      setStudentResults([]);
      setSelectedStudent(null);
      setAllocatedHours('');
      setNotes('');
    }
  }, [open]);

  const handleSelectStudent = React.useCallback((student: StudentResult) => {
    setSelectedStudent(student);
    setStudentSearch(student.full_name);
    setStudentResults([]);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!allocationId || !selectedStudent || !allocatedHours) return;
    setSaving(true);
    try {
      await apiClient('/api/v1/sen/student-hours', {
        method: 'POST',
        body: JSON.stringify({
          resource_allocation_id: allocationId,
          student_id: selectedStudent.id,
          sen_profile_id: selectedStudent.sen_profile_id ?? null,
          allocated_hours: Number(allocatedHours),
          notes: notes || null,
        }),
      });
      toast.success(t('resource.studentHoursCreated'));
      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error('[StudentHoursDialog] save', err);
      toast.error(t('resource.studentHoursSaveError'));
    } finally {
      setSaving(false);
    }
  }, [allocationId, selectedStudent, allocatedHours, notes, onOpenChange, onSubmit, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('resource.assignStudentHours')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('resource.allocation')}</Label>
            <Select value={allocationId} onValueChange={setAllocationId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('resource.selectAllocation')} />
              </SelectTrigger>
              <SelectContent>
                {allocations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.academic_year_name} ({a.source}) - {a.total_hours}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('resource.student')}</Label>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  if (selectedStudent && e.target.value !== selectedStudent.full_name) {
                    setSelectedStudent(null);
                  }
                }}
                placeholder={t('resource.searchStudent')}
                className="ps-9"
              />
              {searchLoading && (
                <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-tertiary" />
              )}
            </div>
            {studentResults.length > 0 && !selectedStudent && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-md">
                {studentResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStudent(s)}
                    className="flex w-full items-center px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-secondary"
                  >
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
            {selectedStudent?.sen_profile_id && (
              <p className="text-xs text-text-tertiary">
                {t('resource.senProfileId')}: {selectedStudent.sen_profile_id}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('resource.allocatedHours')}</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={allocatedHours}
              onChange={(e) => setAllocatedHours(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('resource.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('resource.notesPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('resource.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !allocationId || !selectedStudent || !allocatedHours}
          >
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('resource.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Utilisation bar ──────────────────────────────────────────────────────────

function UtilisationBar({ percentage }: { percentage: number }) {
  const clampedPct = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="h-2 w-full rounded-full bg-surface-secondary">
      <div
        className="h-2 rounded-full bg-primary-500 transition-all"
        style={{ width: `${clampedPct}%` }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResourceAllocationPage() {
  const t = useTranslations('sen');

  // State
  const [allocations, setAllocations] = React.useState<Allocation[]>([]);
  const [studentHours, setStudentHours] = React.useState<StudentHours[]>([]);
  const [utilisation, setUtilisation] = React.useState<UtilisationResponse['data'] | null>(null);
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  // Dialogs
  const [allocationDialogOpen, setAllocationDialogOpen] = React.useState(false);
  const [editAllocation, setEditAllocation] = React.useState<Allocation | null>(null);
  const [studentHoursDialogOpen, setStudentHoursDialogOpen] = React.useState(false);

  // ─── Fetch data ───────────────────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [allocRes, hoursRes, utilRes, yearsRes] = await Promise.all([
        apiClient<AllocationResponse>('/api/v1/sen/resource-allocations?pageSize=100'),
        apiClient<StudentHoursResponse>('/api/v1/sen/student-hours'),
        apiClient<UtilisationResponse>('/api/v1/sen/resource-utilisation'),
        apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=100'),
      ]);
      setAllocations(allocRes.data);
      setStudentHours(hoursRes.data);
      setUtilisation(utilRes.data);
      setAcademicYears(yearsRes.data);
    } catch (err) {
      console.error('[ResourceAllocationPage] fetchData', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const totalAllocatedToStudents = React.useMemo(
    () => studentHours.reduce((sum, sh) => sum + sh.allocated_hours, 0),
    [studentHours],
  );

  const totalParentHours = React.useMemo(
    () => allocations.reduce((sum, a) => sum + a.total_hours, 0),
    [allocations],
  );

  const isOverAllocated = totalAllocatedToStudents > totalParentHours;

  // Chart data for utilisation
  const chartData = React.useMemo(() => {
    if (!utilisation?.student_breakdown) return [];
    return utilisation.student_breakdown.map((sb) => ({
      name: sb.student_name,
      allocated: sb.allocated,
      used: sb.used,
    }));
  }, [utilisation]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('resource.title')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`stat-${i}`} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('resource.title')} />
        <EmptyState
          icon={AlertTriangle}
          title={t('resource.errorTitle')}
          description={t('resource.errorDescription')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t('resource.title')} description={t('resource.description')} />

      {/* ── Section 1: Allocations ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('resource.schoolAllocations')}
          </h2>
          <Button
            onClick={() => {
              setEditAllocation(null);
              setAllocationDialogOpen(true);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t('resource.addAllocation')}
          </Button>
        </div>

        {allocations.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={t('resource.noAllocations')}
            description={t('resource.noAllocationsDescription')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.academicYear')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.source')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.totalHours')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.notes')}
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-text-secondary">
                    {t('resource.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((alloc) => (
                  <tr
                    key={alloc.id}
                    className="border-b border-border last:border-0 hover:bg-surface-secondary"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {alloc.academic_year_name}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={alloc.source} />
                    </td>
                    <td className="px-4 py-3 text-text-primary">{alloc.total_hours}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-text-secondary">
                      {alloc.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditAllocation(alloc);
                          setAllocationDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 2: Student Allocations ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('resource.studentAllocations')}
            </h2>
            {isOverAllocated && (
              <Badge variant="danger" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t('resource.overAllocated')}
              </Badge>
            )}
          </div>
          <Button onClick={() => setStudentHoursDialogOpen(true)}>
            <UserPlus className="me-2 h-4 w-4" />
            {t('resource.assignStudentHours')}
          </Button>
        </div>

        {isOverAllocated && (
          <div className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>
              {t('resource.overAllocatedWarning', {
                allocated: totalAllocatedToStudents,
                total: totalParentHours,
              })}
            </p>
          </div>
        )}

        {studentHours.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={t('resource.noStudentHours')}
            description={t('resource.noStudentHoursDescription')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start">
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.student')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.allocatedHours')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.usedHours')}
                  </th>
                  <th className="min-w-[120px] px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.utilisation')}
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-text-secondary">
                    {t('resource.notes')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {studentHours.map((sh) => {
                  const pct =
                    sh.allocated_hours > 0
                      ? Math.round((sh.used_hours / sh.allocated_hours) * 100)
                      : 0;

                  return (
                    <tr
                      key={sh.id}
                      className="border-b border-border last:border-0 hover:bg-surface-secondary"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">{sh.student_name}</td>
                      <td className="px-4 py-3 text-text-primary">{sh.allocated_hours}</td>
                      <td className="px-4 py-3 text-text-primary">{sh.used_hours}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <UtilisationBar percentage={pct} />
                          </div>
                          <span className="min-w-[40px] text-end text-xs text-text-secondary">
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-text-secondary">
                        {sh.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 3: Utilisation Chart ────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">
          {t('resource.utilisationOverview')}
        </h2>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label={t('resource.totalAllocated')}
            value={utilisation?.total_allocated_hours ?? 0}
          />
          <StatCard label={t('resource.totalUsed')} value={utilisation?.total_used_hours ?? 0} />
          <StatCard
            label={t('resource.overallUtilisation')}
            value={`${Math.round(utilisation?.utilisation_percentage ?? 0)}%`}
          />
        </div>

        {/* Bar chart */}
        {chartData.length > 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              {t('resource.allocationVsUsage')}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="allocated"
                  name={t('resource.allocated')}
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="used"
                  name={t('resource.used')}
                  fill="#0f766e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={Clock} title={t('resource.noUtilisationData')} className="py-12" />
        )}
      </section>

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <AllocationDialog
        open={allocationDialogOpen}
        onOpenChange={setAllocationDialogOpen}
        onSubmit={fetchData}
        initial={editAllocation}
        academicYears={academicYears}
      />

      <StudentHoursDialog
        open={studentHoursDialogOpen}
        onOpenChange={setStudentHoursDialogOpen}
        onSubmit={fetchData}
        allocations={allocations}
      />
    </div>
  );
}
