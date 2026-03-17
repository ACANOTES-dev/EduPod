'use client';

import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, usePathname, useRouter } from 'next/navigation';
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
  StatusBadge,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  id: string;
  title: string;
  status: string;
  category_name: string;
  category_id: string;
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
  meta: { page: number; pageSize: number; total: number };
}

interface GradeConfig {
  id: string;
  grading_scale_id: string | null;
  grading_scale_name: string | null;
  category_weights: Array<{ category_id: string; category_name: string; weight: number }>;
}

interface GradingScale {
  id: string;
  name: string;
}

type TabKey = 'assessments' | 'period-grades' | 'grade-config';

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
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = params.classId as string;

  const [activeTab, setActiveTab] = React.useState<TabKey>('assessments');

  // ─── Assessments Tab ───────────────────────────────────────────────────────
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [assessmentsTotal, setAssessmentsTotal] = React.useState(0);
  const [assessmentsPage, setAssessmentsPage] = React.useState(1);
  const [assessmentsLoading, setAssessmentsLoading] = React.useState(true);
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<Assessment | null>(null);
  const [newStatus, setNewStatus] = React.useState('');
  const PAGE_SIZE = 20;

  const fetchAssessments = React.useCallback(async (p: number) => {
    setAssessmentsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE), class_id: classId });
      const res = await apiClient<AssessmentsResponse>(`/api/v1/gradebook/assessments?${params.toString()}`);
      setAssessments(res.data);
      setAssessmentsTotal(res.meta.total);
    } catch {
      setAssessments([]);
      setAssessmentsTotal(0);
    } finally {
      setAssessmentsLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    if (activeTab === 'assessments') {
      void fetchAssessments(assessmentsPage);
    }
  }, [activeTab, assessmentsPage, fetchAssessments]);

  const handleStatusChange = async () => {
    if (!statusTarget || !newStatus) return;
    try {
      await apiClient(`/api/v1/gradebook/assessments/${statusTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setStatusDialogOpen(false);
      setStatusTarget(null);
      void fetchAssessments(assessmentsPage);
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
          {t(`status${row.status.charAt(0).toUpperCase() + row.status.slice(1)}` as 'statusDraft' | 'statusOpen' | 'statusClosed' | 'statusLocked')}
        </StatusBadge>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      render: (row: Assessment) => (
        <span className="text-text-secondary">{row.category_name}</span>
      ),
    },
    {
      key: 'max_score',
      header: t('maxScore'),
      render: (row: Assessment) => (
        <span className="font-mono text-text-secondary" dir="ltr">{row.max_score}</span>
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
  const [periodGradesTotal, setPeriodGradesTotal] = React.useState(0);
  const [periodGradesPage, setPeriodGradesPage] = React.useState(1);
  const [periodGradesLoading, setPeriodGradesLoading] = React.useState(true);
  const [computing, setComputing] = React.useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = React.useState(false);
  const [overrideTarget, setOverrideTarget] = React.useState<PeriodGrade | null>(null);
  const [overrideScore, setOverrideScore] = React.useState('');
  const [overrideLetter, setOverrideLetter] = React.useState('');

  const fetchPeriodGrades = React.useCallback(async (p: number) => {
    setPeriodGradesLoading(true);
    try {
      const prms = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE), class_id: classId });
      const res = await apiClient<PeriodGradesResponse>(`/api/v1/gradebook/period-grades?${prms.toString()}`);
      setPeriodGrades(res.data);
      setPeriodGradesTotal(res.meta.total);
    } catch {
      setPeriodGrades([]);
      setPeriodGradesTotal(0);
    } finally {
      setPeriodGradesLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    if (activeTab === 'period-grades') {
      void fetchPeriodGrades(periodGradesPage);
    }
  }, [activeTab, periodGradesPage, fetchPeriodGrades]);

  const handleComputeGrades = async () => {
    setComputing(true);
    try {
      await apiClient(`/api/v1/gradebook/period-grades/compute`, {
        method: 'POST',
        body: JSON.stringify({ class_id: classId }),
      });
      void fetchPeriodGrades(periodGradesPage);
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
        method: 'PATCH',
        body: JSON.stringify({
          override_score: overrideScore ? Number(overrideScore) : null,
          override_letter: overrideLetter || null,
        }),
      });
      setOverrideDialogOpen(false);
      void fetchPeriodGrades(periodGradesPage);
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

  // ─── Grade Config Tab ──────────────────────────────────────────────────────
  const [, setGradeConfig] = React.useState<GradeConfig | null>(null);
  const [configLoading, setConfigLoading] = React.useState(true);
  const [scales, setScales] = React.useState<GradingScale[]>([]);
  const [selectedScale, setSelectedScale] = React.useState('');
  const [categoryWeights, setCategoryWeights] = React.useState<Array<{ category_id: string; category_name: string; weight: number }>>([]);
  const [configSaving, setConfigSaving] = React.useState(false);

  const fetchGradeConfig = React.useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await apiClient<{ data: GradeConfig }>(`/api/v1/gradebook/grade-config?class_id=${classId}`);
      setGradeConfig(res.data);
      setSelectedScale(res.data.grading_scale_id ?? '');
      setCategoryWeights(res.data.category_weights ?? []);
    } catch {
      setGradeConfig(null);
    } finally {
      setConfigLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    if (activeTab === 'grade-config') {
      void fetchGradeConfig();
      apiClient<{ data: GradingScale[] }>('/api/v1/gradebook/grading-scales?pageSize=100')
        .then((res) => setScales(res.data))
        .catch(() => undefined);
    }
  }, [activeTab, fetchGradeConfig]);

  const weightsSum = categoryWeights.reduce((acc, cw) => acc + cw.weight, 0);

  const handleConfigSave = async () => {
    setConfigSaving(true);
    try {
      await apiClient(`/api/v1/gradebook/grade-config`, {
        method: 'PUT',
        body: JSON.stringify({
          class_id: classId,
          grading_scale_id: selectedScale || null,
          category_weights: categoryWeights,
        }),
      });
      toast.success('Configuration saved');
      void fetchGradeConfig();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setConfigSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'assessments', label: t('assessments') },
    { key: 'period-grades', label: t('periodGrades') },
    { key: 'grade-config', label: t('gradeConfig') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/gradebook`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={t('title')}
          actions={
            activeTab === 'assessments' ? (
              <Button onClick={() => router.push(`/${locale}/gradebook/${classId}/assessments/new`)}>
                <Plus className="me-2 h-4 w-4" />
                {t('newAssessment')}
              </Button>
            ) : activeTab === 'period-grades' ? (
              <Button onClick={handleComputeGrades} disabled={computing}>
                {computing ? tc('loading') : t('computeGrades')}
              </Button>
            ) : null
          }
        />
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-border" aria-label="Gradebook tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab.key
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'assessments' && (
        <>
          <DataTable
            columns={assessmentColumns}
            data={assessments}
            page={assessmentsPage}
            pageSize={PAGE_SIZE}
            total={assessmentsTotal}
            onPageChange={setAssessmentsPage}
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

      {activeTab === 'period-grades' && (
        <>
          <DataTable
            columns={periodGradeColumns}
            data={periodGrades}
            page={periodGradesPage}
            pageSize={PAGE_SIZE}
            total={periodGradesTotal}
            onPageChange={setPeriodGradesPage}
            keyExtractor={(row) => row.id}
            isLoading={periodGradesLoading}
          />

          {/* Override dialog */}
          <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('override')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {overrideTarget && (
                  <p className="text-sm text-text-secondary">
                    Student: <span className="font-medium text-text-primary">{overrideTarget.student_name}</span>
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
                <Button onClick={handleOverrideSave}>
                  {tc('save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'grade-config' && (
        <div className="space-y-6">
          {configLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
              ))}
            </div>
          ) : (
            <>
              <div className="max-w-md space-y-4">
                <div>
                  <Label>Grading Scale</Label>
                  <Select value={selectedScale} onValueChange={setSelectedScale}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select grading scale" />
                    </SelectTrigger>
                    <SelectContent>
                      {scales.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Category Weights</Label>
                {weightsSum !== 100 && weightsSum > 0 && (
                  <p className="text-sm text-warning-text">
                    {t('weightsWarning', { sum: String(weightsSum) })}
                  </p>
                )}
                {categoryWeights.map((cw, idx) => (
                  <div key={cw.category_id} className="flex items-center gap-3">
                    <span className="min-w-[120px] text-sm text-text-primary">{cw.category_name}</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(cw.weight)}
                      onChange={(e) => {
                        setCategoryWeights((prev) =>
                          prev.map((w, i) => (i === idx ? { ...w, weight: Number(e.target.value) } : w)),
                        );
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-text-tertiary">%</span>
                  </div>
                ))}
              </div>

              <Button onClick={handleConfigSave} disabled={configSaving}>
                {configSaving ? tc('loading') : tc('save')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
