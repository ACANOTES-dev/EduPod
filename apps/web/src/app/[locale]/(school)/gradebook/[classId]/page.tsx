'use client';

import { ArrowLeft, BarChart2, Pencil, Plus } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
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

import { AnalyticsTab } from './analytics-tab';
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

interface PeriodGradesResponse {
  data: PeriodGrade[];
}

interface SelectOption {
  id: string;
  name: string;
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

type TabKey = 'assessments' | 'results' | 'grades' | 'analytics';

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'neutral'> = {
  draft: 'warning',
  open: 'info',
  closed: 'success',
  locked: 'neutral',
};

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
      .catch(() => undefined);
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
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<Assessment | null>(null);
  const [newStatus, setNewStatus] = React.useState('');
  const [assessmentSubjectFilter, setAssessmentSubjectFilter] = React.useState('all');
  const [assessmentSubjects, setAssessmentSubjects] = React.useState<SelectOption[]>([]);
  const PAGE_SIZE = 20;

  // Load subjects for the filter dropdown
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setAssessmentSubjects(res.data))
      .catch(() => undefined);
  }, []);

  const fetchAssessments = React.useCallback(
    async (p: number, subjectId: string) => {
      setAssessmentsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
          class_id: classId,
        });
        if (subjectId !== 'all') params.set('subject_id', subjectId);
        const res = await apiClient<AssessmentsResponse>(
          `/api/v1/gradebook/assessments?${params.toString()}`,
        );
        setAssessments(res.data);
        setAssessmentsTotal(res.meta.total);
      } catch {
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

  const handleStatusChange = async () => {
    if (!statusTarget || !newStatus) return;
    try {
      await apiClient(`/api/v1/gradebook/assessments/${statusTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setStatusDialogOpen(false);
      setStatusTarget(null);
      void fetchAssessments(assessmentsPage, assessmentSubjectFilter);
    } catch {
      toast.error(tc('errorGeneric'));
    }
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
      render: (row: Assessment) => (
        <StatusBadge status={STATUS_VARIANT[row.status] ?? 'neutral'} dot>
          {t(
            `status${row.status.charAt(0).toUpperCase() + row.status.slice(1)}` as
              | 'statusDraft'
              | 'statusOpen'
              | 'statusClosed'
              | 'statusLocked',
          )}
        </StatusBadge>
      ),
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
          {row.due_date ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: Assessment) => (
        <div className="flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setStatusTarget(row);
              setNewStatus('');
              setStatusDialogOpen(true);
            }}
          >
            Status
          </Button>
        </div>
      ),
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

  // Subject & period selectors required by API
  const [pgSubjects, setPgSubjects] = React.useState<SelectOption[]>([]);
  const [pgPeriods, setPgPeriods] = React.useState<SelectOption[]>([]);
  const [pgSubjectId, setPgSubjectId] = React.useState('');
  const [pgPeriodId, setPgPeriodId] = React.useState('');

  // Load subject/period options when tab activates
  React.useEffect(() => {
    if (activeTab === 'grades') {
      apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
        .then((res) => setPgSubjects(res.data))
        .catch(() => undefined);
      apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
        .then((res) => setPgPeriods(res.data))
        .catch(() => undefined);
    }
  }, [activeTab]);

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
        setPeriodGrades(res.data);
      } catch {
        setPeriodGrades([]);
      } finally {
        setPeriodGradesLoading(false);
      }
    },
    [classId],
  );

  React.useEffect(() => {
    if (activeTab === 'grades' && pgSubjectId && pgPeriodId) {
      void fetchPeriodGrades(pgSubjectId, pgPeriodId);
    }
  }, [activeTab, pgSubjectId, pgPeriodId, fetchPeriodGrades]);

  const handleComputeGrades = async () => {
    if (!pgSubjectId || !pgPeriodId) {
      toast.error('Select a subject and period first');
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
    } catch {
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
      if (pgSubjectId && pgPeriodId) void fetchPeriodGrades(pgSubjectId, pgPeriodId);
    } catch {
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
    {
      key: 'analytics',
      label: t('analytics'),
      icon: <BarChart2 className="inline-block me-1 h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="space-y-6">
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
            ) : activeTab === 'grades' ? (
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
        aria-label="Gradebook tabs"
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
          {/* Subject filter for assessments */}
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
                <SelectItem value="all">All Subjects</SelectItem>
                {assessmentSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={assessmentColumns}
            data={assessments}
            page={assessmentsPage}
            pageSize={PAGE_SIZE}
            total={assessmentsTotal}
            onPageChange={setAssessmentsPage}
            onRowClick={(row) =>
              router.push(`/${locale}/gradebook/${classId}/assessments/${row.id}/grades`)
            }
            keyExtractor={(row) => row.id}
            isLoading={assessmentsLoading}
          />

          {/* Status change dialog */}
          <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Status</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {statusTarget && (
                  <p className="text-sm text-text-secondary">
                    Current: <Badge variant="secondary">{statusTarget.status}</Badge>
                  </p>
                )}
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('statusDraft')}</SelectItem>
                    <SelectItem value="open">{t('statusOpen')}</SelectItem>
                    <SelectItem value="closed">{t('statusClosed')}</SelectItem>
                    <SelectItem value="locked">{t('statusLocked')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
                  {tc('cancel')}
                </Button>
                <Button onClick={handleStatusChange} disabled={!newStatus}>
                  {tc('confirm')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'results' && <ResultsMatrix classId={classId} />}

      {activeTab === 'analytics' && <AnalyticsTab classId={classId} />}

      {activeTab === 'grades' && (
        <>
          {/* Subject + period selectors required by API */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={pgSubjectId} onValueChange={setPgSubjectId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('subject')} />
              </SelectTrigger>
              <SelectContent>
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
                {pgPeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!pgSubjectId || !pgPeriodId ? (
            <p className="py-8 text-center text-sm text-text-tertiary">
              Select a subject and period to view grades.
            </p>
          ) : (
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
          )}

          {/* Override dialog */}
          <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('override')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {overrideTarget && (
                  <p className="text-sm text-text-secondary">
                    Student:{' '}
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
                    placeholder="Override score"
                  />
                </div>
                <div>
                  <Label htmlFor="override-letter">Letter Grade</Label>
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
