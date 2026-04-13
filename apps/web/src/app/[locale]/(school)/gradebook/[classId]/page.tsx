'use client';

import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
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

import { ResultsMatrix } from './results-matrix';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  id: string;
  title: string;
  status: string;
  category_name: string;
  category_id: string;
  subject_id?: string;
  subject_name?: string;
  subject?: { id: string; name: string };
  max_score: number;
  due_date: string | null;
  grading_deadline: string | null;
}

interface AssessmentsResponse {
  data: Assessment[];
  meta: { page: number; pageSize: number; total: number };
}

interface PeriodGrade {
  id: string;
  student_id: string;
  student_name: string;
  computed_score: number | null;
  computed_letter: string | null;
  override_score: number | null;
  override_letter: string | null;
  final_score: number | null;
  final_letter: string | null;
}

// ─── API response shape (differs from UI model) ──────────────────────────────

interface RawPeriodGrade {
  id: string;
  student_id: string;
  computed_value: { s: number; e: number; d: number[] } | number | string | null;
  display_value: string | null;
  overridden_value: { s: number; e: number; d: number[] } | number | string | null;
  student: { id: string; first_name: string; last_name: string };
}

interface PeriodGradesResponse {
  data: RawPeriodGrade[];
}

/** Parse a Prisma Decimal object (serialised as { s, e, d }) to a JS number. */
function parseDecimal(
  val: { s: number; e: number; d: number[] } | number | string | null | undefined,
): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || null;
  if (typeof val === 'object' && 'd' in val && 'e' in val && 's' in val) {
    const firstDigit = val.d[0] ?? 0;
    const digitLen = String(firstDigit).length;
    return val.s * firstDigit * Math.pow(10, val.e - digitLen + 1);
  }
  return null;
}

function normalisePeriodGrade(raw: RawPeriodGrade): PeriodGrade {
  const computed = parseDecimal(raw.computed_value);
  const override = parseDecimal(raw.overridden_value);
  return {
    id: raw.id,
    student_id: raw.student_id,
    student_name: `${raw.student?.first_name ?? ''} ${raw.student?.last_name ?? ''}`.trim(),
    computed_score: computed,
    computed_letter: raw.display_value ?? null,
    override_score: override,
    override_letter: null,
    final_score: override ?? computed,
    final_letter: raw.display_value ?? null,
  };
}

interface SelectOption {
  id: string;
  name: string;
}

interface ClassAllocation {
  class_id: string;
  subject_id: string;
  subject_name: string;
  staff_profile_id: string;
  teacher_name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface AssessmentTemplate {
  id: string;
  name: string;
  category_id: string;
  max_score: number;
  rubric_template_id: string | null;
  counts_toward_report_card: boolean;
}

type TabKey = 'assessments' | 'results' | 'grades';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassGradebookPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = params?.classId as string;

  const [activeTab, setActiveTab] = React.useState<TabKey>('assessments');

  // ─── Assessment Templates (for "From Template" dropdown) ──────────────────
  const [assessmentTemplates, setAssessmentTemplates] = React.useState<AssessmentTemplate[]>([]);
  const [templatePopoverOpen, setTemplatePopoverOpen] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: AssessmentTemplate[] }>('/api/v1/gradebook/assessment-templates?pageSize=100')
      .then((res) => setAssessmentTemplates(res.data))
      .catch((err) => {
        console.error('[GradebookPage]', err);
      });
  }, []);

  const handleCreateFromTemplate = (tplId: string) => {
    setTemplatePopoverOpen(false);
    router.push(`/${locale}/gradebook/${classId}/assessments/new?template_id=${tplId}`);
  };

  // ─── Assessments Tab ───────────────────────────────────────────────────────
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [assessmentsTotal, setAssessmentsTotal] = React.useState(0);
  const [assessmentsPage, setAssessmentsPage] = React.useState(1);
  const [assessmentsLoading, setAssessmentsLoading] = React.useState(true);
  const [assessmentSubjectFilter, setAssessmentSubjectFilter] = React.useState('all');
  const [assessmentSubjects, setAssessmentSubjects] = React.useState<SelectOption[]>([]);
  const PAGE_SIZE = 20;

  // ─── Allocations (for subject grouping & ownership) ──────────────────────
  const [mySubjectIds, setMySubjectIds] = React.useState<Set<string>>(new Set());
  const [classAllocations, setClassAllocations] = React.useState<ClassAllocation[]>([]);
  const [allocationsLoaded, setAllocationsLoaded] = React.useState(false);

  // ─── Collapsible subject groups ─────────────────────────────────────────
  const [collapsedSubjects, setCollapsedSubjects] = React.useState<Set<string>>(new Set());
  const toggleSubjectCollapse = React.useCallback((subjectId: string) => {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  }, []);

  // Load teaching allocations → subject ownership + subject filter options
  // Uses allSettled because the owner/principal has no staff profile (my-allocations 404s)
  React.useEffect(() => {
    void Promise.allSettled([
      apiClient<{ data: ClassAllocation[] }>('/api/v1/gradebook/teaching-allocations'),
      apiClient<{ data: ClassAllocation[] }>(`/api/v1/gradebook/classes/${classId}/allocations`),
    ]).then(([myResult, classResult]) => {
      // My allocations — may fail for admin users (no staff profile)
      if (myResult.status === 'fulfilled') {
        const mySubjects = new Set(
          myResult.value.data.filter((a) => a.class_id === classId).map((a) => a.subject_id),
        );
        setMySubjectIds(mySubjects);
      }

      // Class allocations — should always succeed
      if (classResult.status === 'fulfilled') {
        setClassAllocations(classResult.value.data);

        // Derive unique subjects for the filter dropdown
        const subjectMap = new Map<string, string>();
        for (const a of classResult.value.data) {
          if (!subjectMap.has(a.subject_id)) {
            subjectMap.set(a.subject_id, a.subject_name);
          }
        }
        setAssessmentSubjects(
          [...subjectMap.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }

      setAllocationsLoaded(true);
    });
  }, [classId]);

  const fetchAssessments = React.useCallback(
    async (p: number, subjectId: string) => {
      setAssessmentsLoading(true);
      try {
        const effectivePageSize = subjectId === 'all' ? 100 : PAGE_SIZE;
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(effectivePageSize),
          class_id: classId,
          exclude_cancelled: 'true',
        });
        if (subjectId !== 'all') params.set('subject_id', subjectId);
        const res = await apiClient<AssessmentsResponse>(
          `/api/v1/gradebook/assessments?${params.toString()}`,
        );
        // Normalise: API returns category/subject as nested objects
        const normalised = res.data.map((a) => {
          const cat = (a as unknown as { category?: { id: string; name: string } }).category;
          const sub = a.subject;
          return {
            ...a,
            category_name: a.category_name || cat?.name || '',
            category_id: a.category_id || cat?.id || '',
            subject_id: a.subject_id || sub?.id || '',
            subject_name: a.subject_name || sub?.name || '',
          };
        });
        setAssessments(normalised);
        setAssessmentsTotal(res.meta.total);
      } catch (err) {
        console.error('[GradebookPage]', err);
        setAssessments([]);
        setAssessmentsTotal(0);
      } finally {
        setAssessmentsLoading(false);
      }
    },
    [classId],
  );

  React.useEffect(() => {
    if (activeTab === 'assessments') {
      void fetchAssessments(assessmentsPage, assessmentSubjectFilter);
    }
  }, [activeTab, assessmentsPage, assessmentSubjectFilter, fetchAssessments]);

  // ─── Subject grouping for the "All Subjects" view ──────────────────────
  const groupedBySubject = React.useMemo(() => {
    if (assessmentSubjectFilter !== 'all') return null;

    const groups = new Map<
      string,
      { subjectName: string; teacherNames: string; assessments: Assessment[] }
    >();

    for (const a of assessments) {
      const subjectId = a.subject_id || a.subject?.id || '';
      if (!subjectId) continue;
      const subjectName = a.subject_name || a.subject?.name || '';

      if (!groups.has(subjectId)) {
        // Collect ALL teachers for this subject, deduplicate, sort alphabetically by first name
        const allocations = classAllocations.filter((al) => al.subject_id === subjectId);
        const uniqueNames = [...new Set(allocations.map((al) => al.teacher_name).filter(Boolean))];
        uniqueNames.sort((a, b) => a.localeCompare(b));
        groups.set(subjectId, {
          subjectName,
          teacherNames: uniqueNames.join(', '),
          assessments: [],
        });
      }
      // Non-null assertion safe: we just set the key above
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      groups.get(subjectId)!.assessments.push(a);
    }

    return [...groups.entries()].sort(([, a], [, b]) => a.subjectName.localeCompare(b.subjectName));
  }, [assessments, assessmentSubjectFilter, classAllocations]);

  // Auto-collapse non-owned subjects once allocations and assessments are loaded
  const collapsedInitialised = React.useRef(false);
  React.useEffect(() => {
    if (collapsedInitialised.current) return;
    if (!allocationsLoaded || !groupedBySubject || mySubjectIds.size === 0) return;
    const nonOwned = new Set<string>();
    for (const [subjectId] of groupedBySubject) {
      if (!mySubjectIds.has(subjectId)) {
        nonOwned.add(subjectId);
      }
    }
    if (nonOwned.size > 0) {
      setCollapsedSubjects(nonOwned);
      collapsedInitialised.current = true;
    }
  }, [allocationsLoaded, groupedBySubject, mySubjectIds]);

  /** True when the single-subject filter points to a subject the teacher owns (or allocations not yet loaded / admin). */
  const isFilteredSubjectOwned =
    assessmentSubjectFilter === 'all' ||
    !allocationsLoaded ||
    mySubjectIds.size === 0 ||
    mySubjectIds.has(assessmentSubjectFilter);

  // ─── Computed status display ──────────────────────────────────────────────
  const computeDisplayStatus = (
    row: Assessment,
  ): { key: string; variant: 'warning' | 'info' | 'success' | 'neutral' | 'danger' } => {
    if (row.status === 'open') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (row.due_date) {
        const dueDate = new Date(row.due_date);
        dueDate.setHours(0, 0, 0, 0);
        if (today < dueDate) {
          return { key: 'statusScheduled', variant: 'info' };
        }
      }

      if (row.grading_deadline) {
        const deadline = new Date(row.grading_deadline);
        deadline.setHours(0, 0, 0, 0);
        if (today > deadline) {
          return { key: 'statusOverdue', variant: 'danger' };
        }
      }

      // Past due_date but before grading_deadline (or no deadline) → Pending Grading
      return { key: 'statusPendingGrading', variant: 'warning' };
    }

    const variantMap: Record<string, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
      draft: 'warning',
      closed: 'danger',
      submitted_locked: 'success',
      unlock_requested: 'warning',
      reopened: 'info',
      final_locked: 'neutral',
      locked: 'neutral',
    };

    const labelMap: Record<string, string> = {
      draft: 'statusDraft',
      closed: 'statusClosed',
      submitted_locked: 'statusSubmittedLocked',
      unlock_requested: 'statusUnlockRequested',
      reopened: 'statusReopened',
      final_locked: 'statusFinalLocked',
      locked: 'statusLocked',
    };

    return {
      key: labelMap[row.status] ?? 'statusDraft',
      variant: variantMap[row.status] ?? 'neutral',
    };
  };

  const assessmentColumns = [
    {
      key: 'title',
      header: 'Title',
      render: (row: Assessment) => (
        <span className="font-medium text-text-primary">{row.title}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Assessment) => {
        const display = computeDisplayStatus(row);
        return (
          <StatusBadge status={display.variant} dot>
            {t(display.key)}
          </StatusBadge>
        );
      },
    },
    {
      key: 'category',
      header: t('category'),
      render: (row: Assessment) => <span className="text-text-secondary">{row.category_name}</span>,
    },
    {
      key: 'max_score',
      header: t('maxScore'),
      render: (row: Assessment) => (
        <span className="font-mono text-text-secondary" dir="ltr">
          {row.max_score}
        </span>
      ),
    },
    {
      key: 'due_date',
      header: t('dueDate'),
      render: (row: Assessment) => (
        <span className="font-mono text-text-secondary text-xs" dir="ltr">
          {formatShortDate(row.due_date)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: Assessment) =>
        isFilteredSubjectOwned ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${locale}/gradebook/${classId}/assessments/${row.id}/grades`);
            }}
          >
            {t('gradeEntry')}
          </Button>
        ) : null,
    },
  ];

  // ─── Period Grades Tab ─────────────────────────────────────────────────────
  const [periodGrades, setPeriodGrades] = React.useState<PeriodGrade[]>([]);
  const [periodGradesLoading, setPeriodGradesLoading] = React.useState(false);
  const [computing, setComputing] = React.useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = React.useState(false);
  const [overrideTarget, setOverrideTarget] = React.useState<PeriodGrade | null>(null);
  const [overrideScore, setOverrideScore] = React.useState('');
  const [overrideLetter, setOverrideLetter] = React.useState('');

  // Subject & period selectors — support "all" for matrix views
  const [pgSubjects, setPgSubjects] = React.useState<SelectOption[]>([]);
  const [pgPeriods, setPgPeriods] = React.useState<SelectOption[]>([]);
  const [pgSubjectId, setPgSubjectId] = React.useState('');
  const [pgPeriodId, setPgPeriodId] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState('');
  const [showPercentages, setShowPercentages] = React.useState(false);

  // Matrix data for cross-aggregation views
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [matrixData, setMatrixData] = React.useState<Record<string, unknown> | null>(null);
  const [matrixLoading, setMatrixLoading] = React.useState(false);
  const [matrixType, setMatrixType] = React.useState<
    'cross-subject' | 'cross-period' | 'year-overview' | null
  >(null);

  const isAllSubjects = pgSubjectId === 'all';
  const isAllPeriods = pgPeriodId === 'all';
  const isMatrixView = isAllSubjects || isAllPeriods;

  // What type of matrix the current dropdown selection expects
  const expectedMatrixType =
    isAllSubjects && isAllPeriods
      ? ('year-overview' as const)
      : isAllSubjects
        ? ('cross-subject' as const)
        : isAllPeriods
          ? ('cross-period' as const)
          : null;

  // Load class academic year + period/subject options when grades tab activates
  React.useEffect(() => {
    if (activeTab !== 'grades') return;

    // Fetch class to get academic_year_id (response wrapped in { data: {...} })
    apiClient<{ data: { academic_year_id: string } }>(`/api/v1/classes/${classId}`)
      .then((res) => {
        const yearId = res.data.academic_year_id;
        setAcademicYearId(yearId);
        // Load periods for this year
        return apiClient<ListResponse<SelectOption>>(
          `/api/v1/academic-periods?pageSize=50&academic_year_id=${yearId}`,
        );
      })
      .then((res) => setPgPeriods(res.data))
      .catch((err) => {
        console.error('[GradebookPage] grades init', err);
      });

    // Subjects from class allocations (already loaded) or from curriculum matrix
    if (assessmentSubjects.length > 0) {
      setPgSubjects(assessmentSubjects);
    } else {
      apiClient<{ data: Array<{ subject_id: string; subject: { id: string; name: string } }> }>(
        `/api/v1/gradebook/classes/${classId}/grade-configs`,
      )
        .then((res) => {
          const subs = res.data.map((c) => ({ id: c.subject_id, name: c.subject.name }));
          setPgSubjects(subs.sort((a, b) => a.name.localeCompare(b.name)));
        })
        .catch((err) => {
          console.error('[GradebookPage] subjects', err);
        });
    }
  }, [activeTab, classId, assessmentSubjects]);

  // ─── Flat view fetch (specific subject + specific period) ──────────────
  const fetchPeriodGrades = React.useCallback(
    async (subjectId: string, periodId: string) => {
      if (!subjectId || !periodId) return;
      setPeriodGradesLoading(true);
      try {
        const prms = new URLSearchParams({
          class_id: classId,
          subject_id: subjectId,
          academic_period_id: periodId,
        });
        const res = await apiClient<PeriodGradesResponse>(
          `/api/v1/gradebook/period-grades?${prms.toString()}`,
        );
        setPeriodGrades(res.data.map(normalisePeriodGrade));
      } catch (err) {
        console.error('[GradebookPage]', err);
        setPeriodGrades([]);
      } finally {
        setPeriodGradesLoading(false);
      }
    },
    [classId],
  );

  // ─── Matrix view fetch (cross-aggregation) ────────────────────────────
  const fetchMatrixData = React.useCallback(
    async (subjectId: string, periodId: string) => {
      setMatrixLoading(true);
      setMatrixData(null);
      setMatrixType(null);
      try {
        const allSubjects = subjectId === 'all';
        const allPeriods = periodId === 'all';

        let url: string;
        const params = new URLSearchParams({ class_id: classId });

        if (allSubjects && allPeriods) {
          params.set('academic_year_id', academicYearId);
          url = `/api/v1/gradebook/period-grades/year-overview?${params.toString()}`;
        } else if (allSubjects) {
          params.set('academic_period_id', periodId);
          url = `/api/v1/gradebook/period-grades/cross-subject?${params.toString()}`;
        } else {
          params.set('subject_id', subjectId);
          params.set('academic_year_id', academicYearId);
          url = `/api/v1/gradebook/period-grades/cross-period?${params.toString()}`;
        }

        const raw = await apiClient<{ data: Record<string, unknown> } | Record<string, unknown>>(
          url,
        );
        // API may wrap response in { data: ... } — unwrap if present
        const res =
          'data' in raw &&
          typeof raw.data === 'object' &&
          raw.data !== null &&
          !Array.isArray(raw.data)
            ? (raw.data as Record<string, unknown>)
            : raw;
        setMatrixData(res as Record<string, unknown>);
        setMatrixType(
          allSubjects && allPeriods
            ? 'year-overview'
            : allSubjects
              ? 'cross-subject'
              : 'cross-period',
        );
      } catch (err) {
        console.error('[GradebookPage] matrix', err);
        setMatrixData(null);
        setMatrixType(null);
      } finally {
        setMatrixLoading(false);
      }
    },
    [classId, academicYearId],
  );

  // Fetch data when subject/period selection changes
  React.useEffect(() => {
    if (activeTab !== 'grades' || !pgSubjectId || !pgPeriodId) return;

    if (pgSubjectId !== 'all' && pgPeriodId !== 'all') {
      // Flat view
      setMatrixData(null);
      void fetchPeriodGrades(pgSubjectId, pgPeriodId);
    } else if (academicYearId) {
      // Matrix view
      setPeriodGrades([]);
      void fetchMatrixData(pgSubjectId, pgPeriodId);
    }
  }, [activeTab, pgSubjectId, pgPeriodId, academicYearId, fetchPeriodGrades, fetchMatrixData]);

  const handleComputeGrades = async () => {
    if (!pgSubjectId || !pgPeriodId || pgSubjectId === 'all' || pgPeriodId === 'all') {
      toast.error('Select a specific subject and period to compute grades');
      return;
    }
    setComputing(true);
    try {
      await apiClient('/api/v1/gradebook/period-grades/compute', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          subject_id: pgSubjectId,
          academic_period_id: pgPeriodId,
        }),
      });
      void fetchPeriodGrades(pgSubjectId, pgPeriodId);
      toast.success('Grades computed');
    } catch (err) {
      console.error('[GradebookPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setComputing(false);
    }
  };

  const handleOverrideSave = async () => {
    if (!overrideTarget) return;
    try {
      await apiClient(`/api/v1/gradebook/period-grades/${overrideTarget.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          overridden_value: overrideScore || overrideLetter || '',
          override_reason: 'Manual override',
        }),
      });
      setOverrideDialogOpen(false);
      if (pgSubjectId && pgPeriodId && pgSubjectId !== 'all' && pgPeriodId !== 'all') {
        void fetchPeriodGrades(pgSubjectId, pgPeriodId);
      }
    } catch (err) {
      console.error('[GradebookPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const periodGradeColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row: PeriodGrade) => (
        <span className="font-medium text-text-primary">{row.student_name}</span>
      ),
    },
    {
      key: 'computed',
      header: 'Computed',
      render: (row: PeriodGrade) => (
        <span className="text-text-secondary">
          {row.computed_score != null ? `${row.computed_score}` : '—'}
          {row.computed_letter ? ` (${row.computed_letter})` : ''}
        </span>
      ),
    },
    {
      key: 'override',
      header: t('override'),
      render: (row: PeriodGrade) => (
        <span className="text-text-secondary">
          {row.override_score != null ? `${row.override_score}` : ''}
          {row.override_letter ? ` (${row.override_letter})` : ''}
          {row.override_score == null && !row.override_letter ? '—' : ''}
        </span>
      ),
    },
    {
      key: 'final',
      header: 'Final',
      render: (row: PeriodGrade) => (
        <span className="font-medium text-text-primary">
          {row.final_score != null ? `${row.final_score}` : '—'}
          {row.final_letter ? ` (${row.final_letter})` : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: PeriodGrade) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setOverrideTarget(row);
            setOverrideScore(row.override_score != null ? String(row.override_score) : '');
            setOverrideLetter(row.override_letter ?? '');
            setOverrideDialogOpen(true);
          }}
        >
          <Pencil className="me-1 h-3.5 w-3.5" />
          {t('override')}
        </Button>
      ),
    },
  ];

  const tabs: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: 'assessments', label: t('assessments') },
    { key: 'results', label: t('results') },
    { key: 'grades', label: t('grades') },
  ];

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/gradebook`)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader
          title={t('title')}
          actions={
            activeTab === 'assessments' ? (
              <div className="flex items-center gap-2">
                {assessmentTemplates.length > 0 && (
                  <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline">{t('fromTemplate')}</Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-0">
                      <div className="p-2">
                        <p className="px-2 py-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          {t('assessmentTemplates')}
                        </p>
                        {assessmentTemplates.map((tpl) => (
                          <button
                            key={tpl.id}
                            onClick={() => handleCreateFromTemplate(tpl.id)}
                            className="w-full rounded-md px-3 py-2 text-start text-sm hover:bg-surface-secondary transition-colors"
                          >
                            <span className="font-medium text-text-primary">{tpl.name}</span>
                            <span className="ms-2 text-xs text-text-secondary">
                              / {tpl.max_score}
                            </span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Button
                  onClick={() => router.push(`/${locale}/gradebook/${classId}/assessments/new`)}
                >
                  <Plus className="me-2 h-4 w-4" />
                  {t('newAssessment')}
                </Button>
              </div>
            ) : activeTab === 'grades' && !isMatrixView ? (
              <Button onClick={handleComputeGrades} disabled={computing}>
                {computing ? tc('loading') : t('computeGrades')}
              </Button>
            ) : null
          }
        />
      </div>

      {/* Tabs */}
      <nav
        className="flex gap-1 overflow-x-auto border-b border-border"
        aria-label={t('gradebookTabs')}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab.key
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'assessments' && (
        <>
          {/* Subject filter */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={assessmentSubjectFilter}
              onValueChange={(v) => {
                setAssessmentSubjectFilter(v);
                setAssessmentsPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('subject')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allSubjects')}</SelectItem>
                {assessmentSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {assessmentsLoading ? (
            <div className="py-12 text-center text-sm text-text-tertiary">{tc('loading')}</div>
          ) : assessmentSubjectFilter === 'all' && groupedBySubject ? (
            /* ─── Grouped view (all subjects) ──────────────────────── */
            groupedBySubject.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-tertiary">{t('noClasses')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-secondary">
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        {t('title2')}
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        Status
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        {t('category')}
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        {t('maxScore')}
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        {t('dueDate')}
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-text-secondary">
                        {tc('actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedBySubject.map(([subjectId, group]) => {
                      const isOwned =
                        !allocationsLoaded ||
                        mySubjectIds.size === 0 ||
                        mySubjectIds.has(subjectId);
                      const isCollapsed = collapsedSubjects.has(subjectId);
                      return (
                        <React.Fragment key={subjectId}>
                          {/* Section header */}
                          <tr
                            className="bg-primary-50 dark:bg-primary-950/20 border-b border-border cursor-pointer select-none"
                            onClick={() => toggleSubjectCollapse(subjectId)}
                          >
                            <td colSpan={6} className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-semibold text-text-primary">
                                    {group.subjectName}
                                  </span>
                                  {group.teacherNames && (
                                    <span className="ms-3 text-xs text-text-secondary">
                                      — {group.teacherNames}
                                    </span>
                                  )}
                                  <span className="ms-3 text-xs text-text-tertiary">
                                    ({group.assessments.length})
                                  </span>
                                </div>
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Assessment rows (hidden when collapsed) */}
                          {!isCollapsed &&
                            group.assessments.map((row) => {
                              const display = computeDisplayStatus(row);
                              return (
                                <tr
                                  key={row.id}
                                  className={`border-b border-border transition-colors ${
                                    isOwned
                                      ? 'hover:bg-surface-secondary cursor-pointer'
                                      : 'opacity-50'
                                  }`}
                                  onClick={
                                    isOwned
                                      ? () =>
                                          router.push(
                                            `/${locale}/gradebook/${classId}/assessments/${row.id}/grades`,
                                          )
                                      : undefined
                                  }
                                >
                                  <td className="px-4 py-3 font-medium text-text-primary">
                                    {row.title}
                                  </td>
                                  <td className="px-4 py-3">
                                    <StatusBadge status={display.variant} dot>
                                      {t(display.key)}
                                    </StatusBadge>
                                  </td>
                                  <td className="px-4 py-3 text-text-secondary">
                                    {row.category_name}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-text-secondary" dir="ltr">
                                    {row.max_score}
                                  </td>
                                  <td
                                    className="px-4 py-3 font-mono text-text-secondary text-xs"
                                    dir="ltr"
                                  >
                                    {formatShortDate(row.due_date)}
                                  </td>
                                  <td className="px-4 py-3">
                                    {isOwned && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(
                                            `/${locale}/gradebook/${classId}/assessments/${row.id}/grades`,
                                          );
                                        }}
                                      >
                                        {t('gradeEntry')}
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* ─── Flat view (single subject) ─────────────────────── */
            <div className={!isFilteredSubjectOwned ? 'opacity-50' : ''}>
              <DataTable
                columns={assessmentColumns}
                data={assessments}
                page={assessmentsPage}
                pageSize={PAGE_SIZE}
                total={assessmentsTotal}
                onPageChange={setAssessmentsPage}
                onRowClick={
                  isFilteredSubjectOwned
                    ? (row) =>
                        router.push(`/${locale}/gradebook/${classId}/assessments/${row.id}/grades`)
                    : undefined
                }
                keyExtractor={(row) => row.id}
                isLoading={assessmentsLoading}
              />
            </div>
          )}
        </>
      )}

      {activeTab === 'results' && <ResultsMatrix classId={classId} />}

      {activeTab === 'grades' && (
        <>
          {/* Subject + period selectors with "All" options + display toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={pgSubjectId} onValueChange={setPgSubjectId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('subject')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allSubjects')}</SelectItem>
                {pgSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pgPeriodId} onValueChange={setPgPeriodId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('period')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allPeriods')}</SelectItem>
                {pgPeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Display toggle: letter grade vs percentage */}
            {isMatrixView && (
              <div className="ms-auto flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
                <button
                  onClick={() => setShowPercentages(false)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    !showPercentages
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  A B C
                </button>
                <button
                  onClick={() => setShowPercentages(true)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    showPercentages
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  %
                </button>
              </div>
            )}
          </div>

          {!pgSubjectId || !pgPeriodId ? (
            <p className="py-8 text-center text-sm text-text-tertiary">
              {t('selectASubjectAndPeriod')}
            </p>
          ) : matrixLoading || periodGradesLoading ? (
            <div className="py-12 text-center text-sm text-text-tertiary">{tc('loading')}</div>
          ) : isMatrixView && matrixData && matrixType === expectedMatrixType ? (
            /* ─── Matrix views ─────────────────────────────────────── */
            <div className="overflow-x-auto rounded-lg border border-border">
              {isAllSubjects && !isAllPeriods
                ? /* Cross-subject matrix: rows=students, cols=subjects, last=Overall */
                  (() => {
                    const d = matrixData as {
                      students: Array<{
                        student_id: string;
                        student_name: string;
                        subject_grades: Record<
                          string,
                          { computed: number | null; display: string | null }
                        >;
                        overall: { computed: number | null; display: string | null };
                      }>;
                      subjects: Array<{ id: string; name: string; weight: number }>;
                    };
                    return (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-surface-secondary">
                            <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start font-medium text-text-secondary">
                              {t('student')}
                            </th>
                            {d.subjects.map((s) => (
                              <th
                                key={s.id}
                                className="px-3 py-3 text-center font-medium text-text-secondary whitespace-nowrap"
                              >
                                <div>{s.name}</div>
                                <div className="text-xs font-normal text-text-tertiary">
                                  {Math.round(s.weight * 10) / 10}%
                                </div>
                              </th>
                            ))}
                            <th className="px-3 py-3 text-center font-semibold text-primary-700 whitespace-nowrap">
                              {t('weightConfigTotal')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.students.map((row) => (
                            <tr key={row.student_id} className="border-b border-border">
                              <td className="sticky start-0 z-10 bg-background px-4 py-3 font-medium text-text-primary whitespace-nowrap">
                                {row.student_name}
                              </td>
                              {d.subjects.map((s) => {
                                const cell = row.subject_grades[s.id];
                                return (
                                  <td
                                    key={s.id}
                                    className="px-3 py-3 text-center font-mono text-text-secondary"
                                    dir="ltr"
                                  >
                                    {cell?.computed != null
                                      ? showPercentages
                                        ? `${cell.computed}%`
                                        : (cell.display ?? `${cell.computed}%`)
                                      : '—'}
                                  </td>
                                );
                              })}
                              <td
                                className="px-3 py-3 text-center font-mono font-semibold text-primary-700"
                                dir="ltr"
                              >
                                {row.overall.computed != null ? `${row.overall.computed}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()
                : !isAllSubjects && isAllPeriods
                  ? /* Cross-period matrix: rows=students, cols=periods, last=Annual */
                    (() => {
                      const d = matrixData as {
                        students: Array<{
                          student_id: string;
                          student_name: string;
                          period_grades: Record<
                            string,
                            { computed: number | null; display: string | null }
                          >;
                          annual: { computed: number | null; display: string | null };
                        }>;
                        periods: Array<{ id: string; name: string; weight: number }>;
                      };
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-secondary">
                              <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start font-medium text-text-secondary">
                                {t('student')}
                              </th>
                              {d.periods.map((p) => (
                                <th
                                  key={p.id}
                                  className="px-3 py-3 text-center font-medium text-text-secondary whitespace-nowrap"
                                >
                                  <div>{p.name}</div>
                                  <div className="text-xs font-normal text-text-tertiary">
                                    {Math.round(p.weight * 10) / 10}%
                                  </div>
                                </th>
                              ))}
                              <th className="px-3 py-3 text-center font-semibold text-primary-700 whitespace-nowrap">
                                Annual
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.students.map((row) => (
                              <tr key={row.student_id} className="border-b border-border">
                                <td className="sticky start-0 z-10 bg-background px-4 py-3 font-medium text-text-primary whitespace-nowrap">
                                  {row.student_name}
                                </td>
                                {d.periods.map((p) => {
                                  const cell = row.period_grades[p.id];
                                  return (
                                    <td
                                      key={p.id}
                                      className="px-3 py-3 text-center font-mono text-text-secondary"
                                      dir="ltr"
                                    >
                                      {cell?.computed != null
                                        ? showPercentages
                                          ? `${cell.computed}%`
                                          : (cell.display ?? `${cell.computed}%`)
                                        : '—'}
                                    </td>
                                  );
                                })}
                                <td
                                  className="px-3 py-3 text-center font-mono font-semibold text-primary-700"
                                  dir="ltr"
                                >
                                  {row.annual.computed != null ? `${row.annual.computed}%` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()
                  : /* Year overview matrix: rows=students, cols=periods (each with Overall), last=Year */
                    (() => {
                      const d = matrixData as {
                        students: Array<{
                          student_id: string;
                          student_name: string;
                          period_overalls: Record<
                            string,
                            { computed: number | null; display: string | null }
                          >;
                          year_overall: { computed: number | null; display: string | null };
                        }>;
                        periods: Array<{ id: string; name: string; weight: number }>;
                      };
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-surface-secondary">
                              <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start font-medium text-text-secondary">
                                {t('student')}
                              </th>
                              {d.periods.map((p) => (
                                <th
                                  key={p.id}
                                  className="px-3 py-3 text-center font-medium text-text-secondary whitespace-nowrap"
                                >
                                  <div>{p.name}</div>
                                  <div className="text-xs font-normal text-text-tertiary">
                                    {Math.round(p.weight * 10) / 10}%
                                  </div>
                                </th>
                              ))}
                              <th className="px-3 py-3 text-center font-semibold text-primary-700 whitespace-nowrap bg-primary-50 dark:bg-primary-950/20">
                                Year
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.students.map((row) => (
                              <tr key={row.student_id} className="border-b border-border">
                                <td className="sticky start-0 z-10 bg-background px-4 py-3 font-medium text-text-primary whitespace-nowrap">
                                  {row.student_name}
                                </td>
                                {d.periods.map((p) => {
                                  const cell = row.period_overalls[p.id];
                                  return (
                                    <td
                                      key={p.id}
                                      className="px-3 py-3 text-center font-mono text-text-secondary"
                                      dir="ltr"
                                    >
                                      {cell?.computed != null
                                        ? showPercentages
                                          ? `${cell.computed}%`
                                          : (cell.display ?? `${cell.computed}%`)
                                        : '—'}
                                    </td>
                                  );
                                })}
                                <td
                                  className="px-3 py-3 text-center font-mono font-bold text-primary-700 bg-primary-50/50 dark:bg-primary-950/10"
                                  dir="ltr"
                                >
                                  {row.year_overall.computed != null
                                    ? `${row.year_overall.computed}%`
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
            </div>
          ) : !isMatrixView ? (
            /* ─── Flat view (specific subject + specific period) ─── */
            <DataTable
              columns={periodGradeColumns}
              data={periodGrades}
              page={1}
              pageSize={periodGrades.length || 1}
              total={periodGrades.length}
              onPageChange={() => undefined}
              keyExtractor={(row) => row.id}
              isLoading={periodGradesLoading}
            />
          ) : null}

          {/* Override dialog */}
          <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('override')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {overrideTarget && (
                  <p className="text-sm text-text-secondary">
                    {t('student')}{' '}
                    <span className="font-medium text-text-primary">
                      {overrideTarget.student_name}
                    </span>
                  </p>
                )}
                <div>
                  <Label htmlFor="override-score">{t('score')}</Label>
                  <Input
                    id="override-score"
                    type="number"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                    placeholder={t('overrideScore')}
                  />
                </div>
                <div>
                  <Label htmlFor="override-letter">{t('letterGrade')}</Label>
                  <Input
                    id="override-letter"
                    value={overrideLetter}
                    onChange={(e) => setOverrideLetter(e.target.value)}
                    placeholder="e.g. A+"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
                  {tc('cancel')}
                </Button>
                <Button onClick={handleOverrideSave}>{tc('save')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
