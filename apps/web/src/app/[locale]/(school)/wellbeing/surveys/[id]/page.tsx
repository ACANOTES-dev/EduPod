'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
  Skeleton,
} from '@school/ui';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Flag,
  MessageSquare,
  Play,
  ShieldCheck,
  Square,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: 'likert_5' | 'single_choice' | 'freeform';
  display_order: number;
  options: string[] | null;
  is_required: boolean;
}

interface Survey {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'closed' | 'archived';
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'ad_hoc';
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_at: string;
  updated_at: string;
  questions: SurveyQuestion[];
  participation_count?: number;
  eligible_count?: number;
}

interface LikertResult {
  question_id: string;
  question_text: string;
  question_type: 'likert_5';
  mean: number;
  median: number;
  distribution: Record<string, number>;
  response_count: number;
}

interface SingleChoiceResult {
  question_id: string;
  question_text: string;
  question_type: 'single_choice';
  distribution: Record<string, number>;
  response_count: number;
}

interface FreeformResult {
  question_id: string;
  question_text: string;
  question_type: 'freeform';
  approved_count: number;
  redacted_count: number;
  response_count: number;
}

type QuestionResult = LikertResult | SingleChoiceResult | FreeformResult;

interface DepartmentInfo {
  department: string;
  staff_count: number;
  eligible: boolean;
}

interface SurveyResultsResponse {
  survey_id: string;
  response_count: number;
  eligible_count: number;
  below_threshold: boolean;
  questions: QuestionResult[];
  departments?: DepartmentInfo[];
}

interface ModerationItem {
  id: string;
  question_id: string;
  question_text: string;
  answer_text: string;
  moderation_status: 'pending' | 'flagged';
  flagged_matches: string[] | null;
  submitted_at: string;
}

interface ModeratedComment {
  question_id: string;
  question_text: string;
  answer_text: string;
  moderation_status: 'approved' | 'redacted';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIKERT_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

const STATUS_BADGE_VARIANT: Record<Survey['status'], 'secondary' | 'success' | 'info' | 'warning'> = {
  draft: 'secondary',
  active: 'success',
  closed: 'info',
  archived: 'warning',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SurveyDetailPage() {
  const t = useTranslations('wellbeing.surveyDetail');
  const params = useParams();
  const surveyId = params?.id as string;

  // ── State ──
  const [survey, setSurvey] = React.useState<Survey | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  const TAB_KEYS = React.useMemo(() => {
    if (!survey) return ['overview', 'results', 'moderation'] as const;
    const tabs: Array<'overview' | 'results' | 'moderation'> = ['overview'];
    if (survey.status !== 'draft') {
      tabs.push('results');
    }
    const hasFreeform = survey.questions.some((q) => q.question_type === 'freeform');
    if (survey.moderation_enabled && hasFreeform) {
      tabs.push('moderation');
    }
    return tabs;
  }, [survey]);

  const [activeTab, setActiveTab] = React.useState<'overview' | 'results' | 'moderation'>('overview');

  // Results state
  const [results, setResults] = React.useState<SurveyResultsResponse | null>(null);
  const [resultsLoading, setResultsLoading] = React.useState(false);
  const [resultsFetched, setResultsFetched] = React.useState(false);
  const [selectedDepartment, setSelectedDepartment] = React.useState<string>('');
  const [filterBlocked, setFilterBlocked] = React.useState(false);

  // Freeform comments state
  const [comments, setComments] = React.useState<ModeratedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentsVisible, setCommentsVisible] = React.useState(false);

  // Moderation state
  const [moderationItems, setModerationItems] = React.useState<ModerationItem[]>([]);
  const [moderationLoading, setModerationLoading] = React.useState(false);
  const [moderationFetched, setModerationFetched] = React.useState(false);
  const [moderatingId, setModeratingId] = React.useState<string | null>(null);

  // Confirmation dialogs
  const [activateDialogOpen, setActivateDialogOpen] = React.useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [redactDialogOpen, setRedactDialogOpen] = React.useState(false);
  const [redactTargetId, setRedactTargetId] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  // ── Fetch survey ──
  React.useEffect(() => {
    let cancelled = false;

    async function fetchSurvey() {
      try {
        const data = await apiClient<Survey>(
          `/api/v1/staff-wellbeing/surveys/${surveyId}`,
        );
        if (!cancelled) {
          setSurvey(data);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSurvey();
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  // ── Fetch results when results tab is activated ──
  React.useEffect(() => {
    if (activeTab !== 'results') return;
    if (resultsFetched) return;
    if (!survey || (survey.status !== 'closed' && survey.status !== 'archived')) return;

    let cancelled = false;
    setResultsLoading(true);

    async function fetchResults() {
      try {
        const deptParam = selectedDepartment ? `?department=${encodeURIComponent(selectedDepartment)}` : '';
        const data = await apiClient<SurveyResultsResponse>(
          `/api/v1/staff-wellbeing/surveys/${surveyId}/results${deptParam}`,
        );
        if (!cancelled) {
          setResults(data);
          setFilterBlocked(false);
          setResultsFetched(true);
        }
      } catch {
        if (!cancelled) {
          setResults(null);
        }
      } finally {
        if (!cancelled) {
          setResultsLoading(false);
        }
      }
    }

    void fetchResults();
    return () => {
      cancelled = true;
    };
  }, [activeTab, surveyId, resultsFetched, survey, selectedDepartment]);

  // ── Fetch moderation when moderation tab is activated ──
  React.useEffect(() => {
    if (activeTab !== 'moderation') return;
    if (moderationFetched) return;

    let cancelled = false;
    setModerationLoading(true);

    async function fetchModeration() {
      try {
        const data = await apiClient<ModerationItem[]>(
          `/api/v1/staff-wellbeing/surveys/${surveyId}/moderation`,
        );
        if (!cancelled) {
          setModerationItems(data);
          setModerationFetched(true);
        }
      } catch {
        if (!cancelled) {
          setModerationItems([]);
        }
      } finally {
        if (!cancelled) {
          setModerationLoading(false);
        }
      }
    }

    void fetchModeration();
    return () => {
      cancelled = true;
    };
  }, [activeTab, surveyId, moderationFetched]);

  // ── Department filter handler ──
  function handleDepartmentChange(dept: string) {
    setSelectedDepartment(dept);

    // Check if filtering would drop below threshold
    if (dept && results?.departments) {
      const deptInfo = results.departments.find((d) => d.department === dept);
      if (deptInfo && !deptInfo.eligible) {
        setFilterBlocked(true);
        return;
      }
    }

    setFilterBlocked(false);
    setResultsFetched(false); // Triggers re-fetch with department param
  }

  // ── Actions ──
  async function handleActivate() {
    setActionLoading(true);
    try {
      const updated = await apiClient<Survey>(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/activate`,
        { method: 'POST' },
      );
      setSurvey(updated);
      setActivateDialogOpen(false);
    } catch {
      // Error handled by global handler
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClose() {
    setActionLoading(true);
    try {
      const updated = await apiClient<Survey>(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/close`,
        { method: 'POST' },
      );
      setSurvey(updated);
      setCloseDialogOpen(false);
    } catch {
      // Error handled by global handler
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClone() {
    try {
      await apiClient<Survey>(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/clone`,
        { method: 'POST' },
      );
    } catch {
      // Error handled by global handler
    }
  }

  // ── Moderation actions ──
  async function handleModerate(responseId: string, status: 'approved' | 'flagged' | 'redacted') {
    if (status === 'redacted') {
      setRedactTargetId(responseId);
      setRedactDialogOpen(true);
      return;
    }

    setModeratingId(responseId);
    try {
      await apiClient(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/moderation/${responseId}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      );
      setModerationFetched(false); // Triggers re-fetch
    } catch {
      // Error handled by global handler
    } finally {
      setModeratingId(null);
    }
  }

  async function handleConfirmRedact() {
    if (!redactTargetId) return;
    setModeratingId(redactTargetId);
    try {
      await apiClient(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/moderation/${redactTargetId}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'redacted' }) },
      );
      setModerationFetched(false); // Triggers re-fetch
    } catch {
      // Error handled by global handler
    } finally {
      setModeratingId(null);
      setRedactDialogOpen(false);
      setRedactTargetId(null);
    }
  }

  // ── Fetch comments ──
  async function handleViewComments() {
    setCommentsLoading(true);
    try {
      const data = await apiClient<ModeratedComment[]>(
        `/api/v1/staff-wellbeing/surveys/${surveyId}/results/comments`,
      );
      setComments(data);
      setCommentsVisible(true);
    } catch {
      // Error handled by global handler
    } finally {
      setCommentsLoading(false);
    }
  }

  // ── Helpers ──
  const pendingCount = moderationItems.filter(
    (item) => item.moderation_status === 'pending' || item.moderation_status === 'flagged',
  ).length;

  function formatDateDisplay(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatDateOnly(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function computeResponseRate(): string {
    if (!survey) return '0';
    const count = survey.participation_count ?? 0;
    const eligible = survey.eligible_count ?? 1;
    if (eligible === 0) return '0';
    return Math.round((count / eligible) * 100).toString();
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-1 border-b border-border">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-28" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error / not found ──
  if (loadError || !survey) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <ClipboardList className="h-8 w-8 text-text-tertiary" />
          </div>
          <p className="max-w-sm text-center text-sm text-text-secondary">
            {t('title')}
          </p>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={survey.title}
        description={survey.description ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[survey.status]}>
              {t(survey.status)}
            </Badge>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t(tab)}
            {tab === 'moderation' && pendingCount > 0 && (
              <span className="ms-2 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          survey={survey}
          t={t}
          formatDateDisplay={formatDateDisplay}
          computeResponseRate={computeResponseRate}
          onActivate={() => setActivateDialogOpen(true)}
          onClose={() => setCloseDialogOpen(true)}
          onClone={() => void handleClone()}
        />
      )}

      {activeTab === 'results' && (
        <ResultsTab
          survey={survey}
          results={results}
          resultsLoading={resultsLoading}
          selectedDepartment={selectedDepartment}
          filterBlocked={filterBlocked}
          comments={comments}
          commentsVisible={commentsVisible}
          commentsLoading={commentsLoading}
          onDepartmentChange={handleDepartmentChange}
          onViewComments={() => void handleViewComments()}
          t={t}
        />
      )}

      {activeTab === 'moderation' && (
        <ModerationTab
          items={moderationItems}
          loading={moderationLoading}
          moderatingId={moderatingId}
          onModerate={(id, status) => void handleModerate(id, status)}
          t={t}
          formatDateOnly={formatDateOnly}
        />
      )}

      {/* Activate confirmation dialog */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('activate')}</DialogTitle>
            <DialogDescription>{t('activateConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivateDialogOpen(false)}
              disabled={actionLoading}
            >
              {t('overview')}
            </Button>
            <Button
              onClick={() => void handleActivate()}
              disabled={actionLoading}
            >
              <Play className="me-2 h-4 w-4" />
              {t('activate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close confirmation dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('close')}</DialogTitle>
            <DialogDescription>{t('closeConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(false)}
              disabled={actionLoading}
            >
              {t('overview')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleClose()}
              disabled={actionLoading}
            >
              <Square className="me-2 h-4 w-4" />
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redact confirmation dialog */}
      <Dialog open={redactDialogOpen} onOpenChange={setRedactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('redact')}</DialogTitle>
            <DialogDescription>{t('redactConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRedactDialogOpen(false);
                setRedactTargetId(null);
              }}
              disabled={moderatingId !== null}
            >
              {t('overview')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmRedact()}
              disabled={moderatingId !== null}
            >
              {t('redact')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  survey: Survey;
  t: ReturnType<typeof useTranslations>;
  formatDateDisplay: (dateStr: string) => string;
  computeResponseRate: () => string;
  onActivate: () => void;
  onClose: () => void;
  onClone: () => void;
}

function OverviewTab({
  survey,
  t,
  formatDateDisplay,
  computeResponseRate,
  onActivate,
  onClose,
  onClone,
}: OverviewTabProps) {
  const participationCount = survey.participation_count ?? 0;
  const eligibleCount = survey.eligible_count ?? 0;

  return (
    <div className="space-y-6">
      {/* Survey info card */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Status & frequency */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('overview')}
              </p>
              <p className="mt-1 text-sm text-text-primary">{survey.frequency}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-text-tertiary">
                <Calendar className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wider">
                  {t('overview')}
                </p>
              </div>
              <p className="mt-1 text-sm text-text-primary">
                {formatDateDisplay(survey.window_opens_at)}
                <span className="mx-2 text-text-tertiary">&rarr;</span>
                {formatDateDisplay(survey.window_closes_at)}
              </p>
            </div>
          </div>

          {/* Response stats */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('responseStats')}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary" dir="ltr">
                  {participationCount}
                </span>
                <span className="text-sm text-text-secondary">
                  / <span dir="ltr">{eligibleCount}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {t('responseCount', {
                  count: participationCount,
                  eligible: eligibleCount,
                  rate: computeResponseRate(),
                })}
              </p>
            </div>

            {/* Response rate bar */}
            {eligibleCount > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (participationCount / eligibleCount) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-end text-xs text-text-tertiary" dir="ltr">
                  {computeResponseRate()}%
                </p>
              </div>
            )}
          </div>
        </div>

        <Separator className="my-6" />

        {/* Questions summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('viewResponses')}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t('responsesReceived', { count: survey.questions.length })}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {survey.status === 'draft' && (
          <Button onClick={onActivate} className="w-full sm:w-auto">
            <Play className="me-2 h-4 w-4" />
            {t('activate')}
          </Button>
        )}
        {survey.status === 'active' && (
          <Button variant="destructive" onClick={onClose} className="w-full sm:w-auto">
            <Square className="me-2 h-4 w-4" />
            {t('close')}
          </Button>
        )}
        <Button variant="outline" onClick={onClone} className="w-full sm:w-auto">
          <Copy className="me-2 h-4 w-4" />
          {t('clone')}
        </Button>
      </div>
    </div>
  );
}

// ─── Results Tab ──────────────────────────────────────────────────────────────

interface ResultsTabProps {
  survey: Survey;
  results: SurveyResultsResponse | null;
  resultsLoading: boolean;
  selectedDepartment: string;
  filterBlocked: boolean;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onDepartmentChange: (dept: string) => void;
  onViewComments: () => void;
  t: ReturnType<typeof useTranslations>;
}

function ResultsTab({
  survey,
  results,
  resultsLoading,
  selectedDepartment,
  filterBlocked,
  comments,
  commentsVisible,
  commentsLoading,
  onDepartmentChange,
  onViewComments,
  t,
}: ResultsTabProps) {
  // Survey still active — show message instead of results
  if (survey.status === 'active') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <BarChart3 className="h-7 w-7 text-blue-600" />
        </div>
        <p className="max-w-sm text-center text-sm text-text-secondary">
          {t('surveyActive')}
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (resultsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  // No results
  if (!results) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
          <BarChart3 className="h-7 w-7 text-text-tertiary" />
        </div>
        <p className="text-sm text-text-secondary">{t('title')}</p>
      </div>
    );
  }

  // Below threshold
  if (results.below_threshold) {
    return (
      <div className="space-y-6">
        <AnonymityPanel t={t} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-8">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          <p className="max-w-sm text-center text-sm text-amber-800">
            {t('belowThreshold', { threshold: survey.min_response_threshold })}
          </p>
        </div>
      </div>
    );
  }

  // Eligible departments for filter
  const eligibleDepartments = (results.departments ?? []).filter((d) => d.eligible);

  return (
    <div className="space-y-6">
      {/* Anonymity explanation panel */}
      <AnonymityPanel t={t} />

      {/* Department filter */}
      {eligibleDepartments.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            htmlFor="dept-filter"
            className="text-sm font-medium text-text-primary"
          >
            {t('departmentFilter')}
          </label>
          <select
            id="dept-filter"
            value={selectedDepartment}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">{t('allDepartments')}</option>
            {eligibleDepartments.map((dept) => (
              <option key={dept.department} value={dept.department}>
                {dept.department} ({dept.staff_count})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cross-filter blocking message */}
      {filterBlocked && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{t('filterBlocked')}</p>
        </div>
      )}

      {/* Question results */}
      {!filterBlocked &&
        results.questions.map((question) => (
          <QuestionResultCard
            key={question.question_id}
            question={question}
            survey={survey}
            comments={comments}
            commentsVisible={commentsVisible}
            commentsLoading={commentsLoading}
            onViewComments={onViewComments}
            t={t}
          />
        ))}
    </div>
  );
}

// ─── Anonymity Panel ──────────────────────────────────────────────────────────

function AnonymityPanel({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
          <ShieldCheck className="h-5 w-5 text-blue-700" />
        </div>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-blue-900">
          {t('anonymityNote')}
        </p>
      </div>
    </div>
  );
}

// ─── Question Result Card ─────────────────────────────────────────────────────

interface QuestionResultCardProps {
  question: QuestionResult;
  survey: Survey;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onViewComments: () => void;
  t: ReturnType<typeof useTranslations>;
}

function QuestionResultCard({
  question,
  survey,
  comments,
  commentsVisible,
  commentsLoading,
  onViewComments,
  t,
}: QuestionResultCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        {question.question_text}
      </h3>

      {question.question_type === 'likert_5' && (
        <LikertResultChart question={question} t={t} />
      )}

      {question.question_type === 'single_choice' && (
        <SingleChoiceResultChart question={question} />
      )}

      {question.question_type === 'freeform' && (
        <FreeformResultSection
          question={question}
          survey={survey}
          comments={comments.filter(
            (c) => c.question_id === question.question_id,
          )}
          commentsVisible={commentsVisible}
          commentsLoading={commentsLoading}
          onViewComments={onViewComments}
          t={t}
        />
      )}

      <p className="mt-3 text-xs text-text-tertiary">
        <span dir="ltr">{question.response_count}</span>{' '}
        {t('responsesReceived', { count: question.response_count })}
      </p>
    </div>
  );
}

// ─── Likert Result Chart ──────────────────────────────────────────────────────

function LikertResultChart({
  question,
  t,
}: {
  question: LikertResult;
  t: ReturnType<typeof useTranslations>;
}) {
  const data = [1, 2, 3, 4, 5].map((val) => ({
    name: String(val),
    value: question.distribution[String(val)] ?? 0,
  }));

  return (
    <div className="space-y-4">
      {/* Mean and median */}
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-xs font-medium text-text-tertiary">{t('mean')}</p>
          <p className="text-lg font-semibold text-text-primary" dir="ltr">
            {question.mean.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-tertiary">{t('median')}</p>
          <p className="text-lg font-semibold text-text-primary" dir="ltr">
            {question.median.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Horizontal stacked bar */}
      <div className="w-full" style={{ height: 60 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={[{ ...Object.fromEntries(data.map((d) => [d.name, d.value])), name: 'dist' }]}
            stackOffset="expand"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              formatter={(v, name) => {
                const numVal = Number(v);
                const total = data.reduce((sum, d) => sum + d.value, 0);
                const pct = total > 0 ? Math.round((numVal / total) * 100) : 0;
                return [`${String(v)} (${pct}%)`, String(name)];
              }}
            />
            {data.map((entry, index) => (
              <Bar
                key={entry.name}
                dataKey={entry.name}
                stackId="a"
                fill={LIKERT_COLORS[index]}
                radius={
                  index === 0
                    ? [4, 0, 0, 4]
                    : index === data.length - 1
                      ? [0, 4, 4, 0]
                      : [0, 0, 0, 0]
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: LIKERT_COLORS[index] }}
            />
            <span className="text-text-secondary">
              <span dir="ltr">{entry.name}</span> (<span dir="ltr">{entry.value}</span>)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single Choice Result Chart ───────────────────────────────────────────────

const CHOICE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

function SingleChoiceResultChart({ question }: { question: SingleChoiceResult }) {
  const entries = Object.entries(question.distribution);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const data = entries.map(([option, count]) => ({
    name: option,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  return (
    <div className="w-full" style={{ height: Math.max(200, data.length * 50) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 30, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(v) => [`${String(v)}`]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHOICE_COLORS[index % CHOICE_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Freeform Result Section ──────────────────────────────────────────────────

interface FreeformResultSectionProps {
  question: FreeformResult;
  survey: Survey;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onViewComments: () => void;
  t: ReturnType<typeof useTranslations>;
}

function FreeformResultSection({
  question,
  survey,
  comments,
  commentsVisible,
  commentsLoading,
  onViewComments,
  t,
}: FreeformResultSectionProps) {
  const belowThreshold = question.response_count < survey.min_response_threshold;

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-text-tertiary" />
          <span className="text-text-secondary">
            {t('responsesReceived', { count: question.response_count })}
          </span>
        </div>
        {question.approved_count > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-text-secondary" dir="ltr">{question.approved_count} {t('approved')}</span>
          </div>
        )}
        {question.redacted_count > 0 && (
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-text-secondary" dir="ltr">{question.redacted_count} {t('redacted')}</span>
          </div>
        )}
      </div>

      {/* View responses button — only if above threshold */}
      {!belowThreshold && !commentsVisible && (
        <Button
          variant="outline"
          size="sm"
          onClick={onViewComments}
          disabled={commentsLoading}
          className="min-h-[44px]"
        >
          <Eye className="me-2 h-4 w-4" />
          {commentsLoading ? '...' : t('viewResponses')}
        </Button>
      )}

      {belowThreshold && (
        <p className="text-xs text-amber-700">
          {t('belowThreshold', { threshold: survey.min_response_threshold })}
        </p>
      )}

      {/* Approved comments display */}
      {commentsVisible && comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((comment, idx) => (
            <div
              key={`${comment.question_id}-${idx}`}
              className="rounded-lg border border-border bg-surface-secondary p-3"
            >
              {comment.moderation_status === 'redacted' ? (
                <p className="text-sm italic text-text-tertiary">[{t('redacted')}]</p>
              ) : (
                <p className="text-sm text-text-primary">{comment.answer_text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {commentsVisible && comments.length === 0 && (
        <p className="text-sm text-text-tertiary">{t('noModerationItems')}</p>
      )}
    </div>
  );
}

// ─── Moderation Tab ───────────────────────────────────────────────────────────

interface ModerationTabProps {
  items: ModerationItem[];
  loading: boolean;
  moderatingId: string | null;
  onModerate: (responseId: string, status: 'approved' | 'flagged' | 'redacted') => void;
  t: ReturnType<typeof useTranslations>;
  formatDateOnly: (dateStr: string) => string;
}

function ModerationTab({
  items,
  loading,
  moderatingId,
  onModerate,
  t,
  formatDateOnly,
}: ModerationTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <p className="text-sm text-text-secondary">{t('noModerationItems')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {t('moderationCount', { count: items.length })}
      </p>

      {items.map((item) => (
        <ModerationItemCard
          key={item.id}
          item={item}
          isProcessing={moderatingId === item.id}
          onModerate={onModerate}
          t={t}
          formatDateOnly={formatDateOnly}
        />
      ))}
    </div>
  );
}

// ─── Moderation Item Card ─────────────────────────────────────────────────────

interface ModerationItemCardProps {
  item: ModerationItem;
  isProcessing: boolean;
  onModerate: (responseId: string, status: 'approved' | 'flagged' | 'redacted') => void;
  t: ReturnType<typeof useTranslations>;
  formatDateOnly: (dateStr: string) => string;
}

function ModerationItemCard({
  item,
  isProcessing,
  onModerate,
  t,
  formatDateOnly,
}: ModerationItemCardProps) {
  // Highlight flagged matches in the answer text
  function renderHighlightedText(text: string, matches: string[] | null): React.ReactNode {
    if (!matches || matches.length === 0) {
      return text;
    }

    // Build a regex from all matches, escaping special characters
    const escapedMatches = matches.map((m) =>
      m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const regex = new RegExp(`(${escapedMatches.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      const isMatch = matches.some(
        (m) => m.toLowerCase() === part.toLowerCase(),
      );
      if (isMatch) {
        return (
          <mark
            key={idx}
            className="rounded-sm bg-yellow-200 px-0.5"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      {/* Question context */}
      <p className="mb-2 text-xs font-medium text-text-tertiary">
        {item.question_text}
      </p>

      {/* Response text with highlighted matches */}
      <div className="mb-3 rounded-lg bg-surface-secondary p-3">
        <p className="text-sm leading-relaxed text-text-primary">
          {renderHighlightedText(item.answer_text, item.flagged_matches)}
        </p>
      </div>

      {/* Meta row */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
        {item.moderation_status === 'flagged' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            {t('flagged')}
          </span>
        )}
        {item.moderation_status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
            {t('pendingModeration')}
          </span>
        )}
        <span>
          {t('submittedDate')}: {formatDateOnly(item.submitted_at)}
        </span>
        {item.flagged_matches && item.flagged_matches.length > 0 && (
          <span>
            {t('flaggedMatches')}: {item.flagged_matches.join(', ')}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onModerate(item.id, 'approved')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <CheckCircle2 className="me-2 h-4 w-4 text-green-600" />
          {t('approve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onModerate(item.id, 'flagged')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <Flag className="me-2 h-4 w-4 text-amber-600" />
          {t('flag')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onModerate(item.id, 'redacted')}
          disabled={isProcessing}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <XCircle className="me-2 h-4 w-4" />
          {t('redact')}
        </Button>
      </div>
    </div>
  );
}
