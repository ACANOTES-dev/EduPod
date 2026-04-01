'use client';

import { ClipboardList, Play, Square } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@school/ui';


import { ModerationTab } from './_components/moderation-tab';
import { OverviewTab } from './_components/overview-tab';
import { ResultsTab } from './_components/results-tab';
import type {
  ModeratedComment,
  ModerationItem,
  Survey,
  SurveyResultsResponse,
} from './_components/survey-types';
import { STATUS_BADGE_VARIANT } from './_components/survey-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Page ────────────────────────────────────────────────────────────────────

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

  const [activeTab, setActiveTab] = React.useState<'overview' | 'results' | 'moderation'>(
    'overview',
  );

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
        const data = await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${surveyId}`);
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
        const deptParam = selectedDepartment
          ? `?department=${encodeURIComponent(selectedDepartment)}`
          : '';
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

    if (dept && results?.departments) {
      const deptInfo = results.departments.find((d) => d.department === dept);
      if (deptInfo && !deptInfo.eligible) {
        setFilterBlocked(true);
        return;
      }
    }

    setFilterBlocked(false);
    setResultsFetched(false);
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
    } catch (err) {
      // Error handled by global handler
      console.error('[setActivateDialogOpen]', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClose() {
    setActionLoading(true);
    try {
      const updated = await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${surveyId}/close`, {
        method: 'POST',
      });
      setSurvey(updated);
      setCloseDialogOpen(false);
    } catch (err) {
      // Error handled by global handler
      console.error('[setCloseDialogOpen]', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClone() {
    try {
      await apiClient<Survey>(`/api/v1/staff-wellbeing/surveys/${surveyId}/clone`, {
        method: 'POST',
      });
    } catch (err) {
      // Error handled by global handler
      console.error('[handleClone]', err);
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
      await apiClient(`/api/v1/staff-wellbeing/surveys/${surveyId}/moderation/${responseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setModerationFetched(false);
    } catch (err) {
      // Error handled by global handler
      console.error('[setModerationFetched]', err);
    } finally {
      setModeratingId(null);
    }
  }

  async function handleConfirmRedact() {
    if (!redactTargetId) return;
    setModeratingId(redactTargetId);
    try {
      await apiClient(`/api/v1/staff-wellbeing/surveys/${surveyId}/moderation/${redactTargetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'redacted' }),
      });
      setModerationFetched(false);
    } catch (err) {
      // Error handled by global handler
      console.error('[setModerationFetched]', err);
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
    } catch (err) {
      // Error handled by global handler
      console.error('[setCommentsVisible]', err);
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
          <p className="max-w-sm text-center text-sm text-text-secondary">{t('title')}</p>
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
            <Badge variant={STATUS_BADGE_VARIANT[survey.status]}>{t(survey.status)}</Badge>
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
        />
      )}

      {activeTab === 'moderation' && (
        <ModerationTab
          items={moderationItems}
          loading={moderationLoading}
          moderatingId={moderatingId}
          onModerate={(id, status) => void handleModerate(id, status)}
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
            <Button onClick={() => void handleActivate()} disabled={actionLoading}>
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
